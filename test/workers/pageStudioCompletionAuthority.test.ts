import { describe, expect, it, vi } from 'vitest'
import { ContentAttachmentCompletionSchema } from '../../shared/pageStudio/content-attachment'
import { handleContentAttachmentCompletion } from '../../workers/page-studio-management/src/contentAttachmentCompletion'

const completion = ContentAttachmentCompletionSchema.parse({
  activationId: '10000000-0000-4000-8000-000000000001',
  identity: `cms_attach_${'a'.repeat(64)}`,
  operationId: 'attach_one',
  proofDigest: 'b'.repeat(64),
  scope: { businessId: 'business_one', clientId: 'client_one', environment: 'staging', siteId: 'site_one', tenantId: 'tenant_one' },
  version: 1
})
const input = { expectedEnvironment: 'staging', completion }
const reader = () => vi.fn<(sql: string, params: unknown[]) => Promise<{ metadata: unknown } | null>>()

describe('private completion authority', () => {
  it('reads the exact scoped committed receipt fresh on every call, including after its removal', async () => {
    const read = reader()
      .mockResolvedValueOnce({ metadata: completion })
      .mockResolvedValueOnce(null)
    expect(await handleContentAttachmentCompletion(input, 'staging', read)).toEqual({ ok: true, value: completion })
    expect(await handleContentAttachmentCompletion(input, 'staging', read)).toEqual({ ok: true, value: null })
    expect(read).toHaveBeenCalledTimes(2)
    for (const [sql, params] of read.mock.calls) {
      expect(sql).toMatch(/SELECT\s+metadata\s+FROM\s+page_studio_audit_events/i)
      expect(sql).toMatch(/tenant_id\s*=\s*\$1/)
      expect(sql).toMatch(/client_id\s*=\s*\$2/)
      expect(sql).toMatch(/site_id\s*=\s*\$3/)
      expect(sql).toMatch(/resource_id\s*=\s*\$4/)
      expect(sql).toContain('action=\'content.attachment.completed\'')
      expect(sql).toContain('resource_type=\'content_attachment\'')
      expect(params).toEqual(['tenant_one', 'client_one', 'site_one', 'attach_one'])
    }
  })

  it.each([
    null, {}, completion,
    { ...input, extra: 'not-allowed' },
    { ...input, expectedEnvironment: 'preview' },
    { ...input, completion: { ...completion, extra: 'not-allowed' } },
    { ...input, completion: { ...completion, version: 2 } },
    { ...input, completion: { ...completion, scope: { ...completion.scope, extra: 'not-allowed' } } }
  ])('rejects malformed input before reading authority: %j', async (value) => {
    const read = reader()
    expect(await handleContentAttachmentCompletion(value, 'staging', read)).toMatchObject({ ok: false, error: { statusCode: 400 } })
    expect(read).not.toHaveBeenCalled()
  })

  it.each([
    { ...input, expectedEnvironment: 'production' },
    { ...input, completion: { ...completion, scope: { ...completion.scope, environment: 'production' } } }
  ])('fails closed when the caller or receipt environment differs from the Worker', async (value) => {
    const read = reader()
    expect(await handleContentAttachmentCompletion(value, 'staging', read)).toMatchObject({ ok: false, error: { statusCode: 503 } })
    expect(read).not.toHaveBeenCalled()
  })

  it('permits an explicitly matching production receipt', async () => {
    const production = { ...completion, scope: { ...completion.scope, environment: 'production' } }
    const read = reader().mockResolvedValue({ metadata: production })
    expect(await handleContentAttachmentCompletion({ expectedEnvironment: 'production', completion: production }, 'production', read))
      .toEqual({ ok: true, value: production })
  })

  it.each(['preview', ''])('rejects an unavailable Worker environment before reading: %s', async (environment) => {
    const read = reader()
    expect(await handleContentAttachmentCompletion(input, environment, read)).toMatchObject({ ok: false, error: { statusCode: 503 } })
    expect(read).not.toHaveBeenCalled()
  })

  it.each([
    { ...completion, activationId: '10000000-0000-4000-8000-000000000002' },
    { ...completion, identity: `cms_attach_${'c'.repeat(64)}` },
    { ...completion, operationId: 'attach_two' },
    { ...completion, proofDigest: 'd'.repeat(64) },
    ...['businessId', 'clientId', 'siteId', 'tenantId'].map(key => ({ ...completion, scope: { ...completion.scope, [key]: 'foreign_scope' } })),
    { ...completion, scope: { ...completion.scope, environment: 'production' } },
    { ...completion, version: 2 },
    { ...completion, unexpected: 'private metadata' },
    { ...completion, scope: { ...completion.scope, unexpected: 'private metadata' } },
    JSON.stringify(completion), null
  ])('rejects every mismatched or malformed persisted receipt: %j', async (metadata) => {
    const read = reader().mockResolvedValue({ metadata })
    expect(await handleContentAttachmentCompletion(input, 'staging', read)).toMatchObject({ ok: false, error: { statusCode: 403 } })
    expect(read).toHaveBeenCalledOnce()
  })

  it('validates receipt values independently of JSON property order', async () => {
    const reversed = Object.fromEntries(Object.entries(completion).reverse())
    reversed.scope = Object.fromEntries(Object.entries(completion.scope).reverse())
    expect(await handleContentAttachmentCompletion(input, 'staging', reader().mockResolvedValue({ metadata: reversed })))
      .toEqual({ ok: true, value: completion })
  })

  it('returns a sanitized unavailable response on a database error, without retrying', async () => {
    const read = reader().mockRejectedValue(new Error('postgres://private:password@database.invalid SQL private metadata'))
    const result = await handleContentAttachmentCompletion(input, 'staging', read)
    expect(result).toMatchObject({ ok: false, error: { statusCode: 503, code: expect.any(String), message: expect.any(String) } })
    expect(JSON.stringify(result)).not.toMatch(/postgres|password|database\.invalid|SQL|private metadata/)
    expect(read).toHaveBeenCalledOnce()
  })
})
