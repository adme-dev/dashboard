import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TransferControlsRequestSchema, TransferControlsViewSchema, TransferControlsResponseSchema } from '~~/shared/pageStudio/transferControls'
import { handleTransferControls } from '~~/workers/page-studio-management/src/transferControls'

const siteId = randomUUID(), requestId = randomUUID()
const ownerLoginSessionHash = 'a'.repeat(64)
const request = { action: 'request', expectedEnvironment: 'production', siteId, requestId, ownerLoginSessionHash }
const view = { requestId, siteId, revision: 1, state: 'requested', review: null,
  expiresAt: '2026-10-20T12:00:00.000Z', allowedActions: ['revoke'] }
const production = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const forbiddenDatabase = async <T>(): Promise<T> => {
  throw new Error('Database must not be called')
}

describe('private transfer controls contracts', () => {
  it('rejects authority substitution and arbitrary phase/proof fields', () => {
    expect(TransferControlsRequestSchema.safeParse(request).success).toBe(true)
    for (const change of [{ entitlementId: randomUUID() }, { authority: {} }, { operationId: randomUUID() }, { sourceDigest: 'b'.repeat(64) },
      { expectedEnvironment: 'staging' }, { action: 'complete' }, { ownerLoginSessionHash: 'not-a-hash' }]) {
      expect(TransferControlsRequestSchema.safeParse({ ...request, ...change }).success).toBe(false)
    }
  })
  it('requires a positive exact revision for every review/approval/reservation mutation', () => {
    const approval = { ...request, action: 'approve', expectedRevision: 2 }
    expect(TransferControlsRequestSchema.safeParse(approval).success).toBe(true)
    for (const expectedRevision of [0, -1, 1.1, '2', 2147483648, undefined]) {
      expect(TransferControlsRequestSchema.safeParse({ ...approval, expectedRevision }).success).toBe(false)
    }
  })
  it('rejects private proof/credential fields on every public view and list entry', () => {
    expect(TransferControlsViewSchema.safeParse(view).success).toBe(true)
    for (const secret of ['ownerLoginSessionHash', 'operator', 'operationId', 'intentDigest', 'sourceDigest', 'objectKey']) {
      const leaked = { ...view, [secret]: 'private' }
      expect(TransferControlsViewSchema.safeParse(leaked).success).toBe(false)
      expect(TransferControlsResponseSchema.safeParse({ ok: true, requestDigest: 'b'.repeat(64),
        value: { requests: [leaked], nextCursor: null } }).success).toBe(false)
    }
  })
  it('bounds review sizes and operator list pages', () => {
    expect(TransferControlsViewSchema.safeParse({ ...view, review: { checkpointId: 'checkpoint_a', applicationId: randomUUID(), objectCount: 1001 } }).success).toBe(false)
    expect(TransferControlsResponseSchema.safeParse({ ok: true, requestDigest: 'b'.repeat(64),
      value: { requests: Array(51).fill(view), nextCursor: null } }).success).toBe(false)
  })
  it('fails closed before any database call for malformed private input', async () => {
    const result = await handleTransferControls({ ...request, ownerLoginSessionHash: 'secret-invalid' }, production, forbiddenDatabase)
    expect(result).toMatchObject({ ok: false, error: { statusCode: 400 } })
    expect(JSON.stringify(result)).not.toContain('secret-invalid')
  })
  it.each([
    {}, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' },
    { ...production, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }
  ])('fails closed before a database call when production is not independently configured: %j', async (env) => {
    const result = await handleTransferControls(request, env, forbiddenDatabase)
    expect(result).toMatchObject({ ok: false, error: { statusCode: 503 } })
    expect(TransferControlsResponseSchema.safeParse(result).success).toBe(true)
    expect(JSON.stringify(result)).not.toContain(ownerLoginSessionHash)
  })
  it('returns only a fixed bounded error after an unexpected database failure', async () => {
    const result = await handleTransferControls(request, production, async () => {
      throw new Error('credential-private-stack')
    })
    expect(result).toMatchObject({ ok: false, error: { statusCode: 503 } })
    expect(JSON.stringify(result)).not.toContain('credential-private-stack')
  })
})
