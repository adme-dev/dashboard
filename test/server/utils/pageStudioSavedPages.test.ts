import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPageStudioDocument, savePageStudioDocument, replayPageStudioDocumentSave, defaultPageStudioDocument } from '~~/server/utils/pageStudio/documents'
import { loadApprovedPageStudioReleaseCheckpoint, loadPageStudioCheckpoint } from '~~/server/utils/pageStudio/releaseCheckpoint'

const database = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => database)
const scope = { tenantId: 'tenant-a', clientId: 'client-a', siteId: 'site-a' }
const key = 'tenants/tenant-a/clients/client-a/sites/site-a/checkpoints/saved.json'
const manifest = {
  id: 'site-a', schemaVersion: 2, defaultLocale: 'en-AU',
  shell: { navigation: {}, footer: {} }, seo: {}, theme: {},
  pages: ['/', '/bookings'].map((route, index) => ({
    id: `page_${index}`, title: index ? 'Request a booking' : 'Home', route,
    visibility: 'public', seo: { title: 'Fantasy Limo', description: 'Latest saved SEO' },
    components: [{ id: 'component', type: 'booking', props: { preserve: true } }],
    forms: index ? [{ id: 'booking-form', fields: [{ name: 'email', type: 'email' }] }] : []
  }))
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
}
const digest = createHash('sha256').update(canonical(manifest)).digest('hex')
const envelope = { schemaVersion: 1, checkpointId: 'saved', digest, scope, manifest }
const row = {
  client_id: 'client-a', current_checkpoint_id: 'saved', checkpoint_digest: digest,
  checkpoint_object_key: key, checkpoint_created_at: '2026-09-11T07:00:00Z',
  document: null, name: 'Fantasy Limo', pages_per_site_limit: 15, revision: null,
  route: 'fantasy-limo', updated_at: null
}
function bucket(value: unknown = envelope) {
  return { get: vi.fn(async () => ({ body: new Response(JSON.stringify(value)).body! })) }
}
function read(value: unknown = envelope) {
  return loadPageStudioCheckpoint({ scope, bucket: bucket(value), checkpointId: 'saved', objectKey: key, digests: [digest] })
}
beforeEach(() => {
  vi.resetAllMocks()
  database.queryOneFresh.mockResolvedValue(row)
})

describe('Dashboard Pages reads the authoritative Studio website', () => {
  it('returns saved pages, SEO and forms without converting or exposing component content', async () => {
    const storage = bucket()
    const result = await getPageStudioDocument('tenant-a', 'site-a', storage)
    expect(result.document).toBeNull()
    expect(result.studio?.checkpointId).toBe('saved')
    expect(result.studio?.pages.map(page => page.route)).toEqual(['/', '/bookings'])
    expect(result.studio?.pages[1]).toMatchObject({ title: 'Request a booking', forms: [{ id: 'booking-form' }] })
    expect(result.studio?.pages[0].seo.description).toBe('Latest saved SEO')
    expect(result.studio?.pages[1]).not.toHaveProperty('components')
    expect(result.updatedAt).toBe(row.checkpoint_created_at)
    expect(storage.get).toHaveBeenCalledWith(key)
    expect(database.queryOne).not.toHaveBeenCalled()
    expect(database.queryOneFresh).toHaveBeenCalledWith(expect.stringContaining('checkpoint.client_id = site.client_id'), ['tenant-a', 'site-a'])
    expect(manifest.pages[1].components[0].props.preserve).toBe(true)
  })

  it('keeps the legacy editable document only when no Studio checkpoint exists', async () => {
    database.queryOneFresh.mockResolvedValue({ ...row, current_checkpoint_id: null })
    const storage = bucket()
    const result = await getPageStudioDocument('tenant-a', 'site-a', storage)
    expect(result.document?.pages).toHaveLength(1)
    expect(result.studio).toBeUndefined()
    expect(storage.get).not.toHaveBeenCalled()
  })

  it('preserves previously saved dashboard documents for sites without a checkpoint', async () => {
    const document = defaultPageStudioDocument('Saved legacy site')
    database.queryOneFresh.mockResolvedValue({ ...row, current_checkpoint_id: null, document, revision: '3' })
    expect((await getPageStudioDocument('tenant-a', 'site-a')).document).toEqual(document)
  })

  it('never substitutes the placeholder when storage, metadata or manifest cannot be read', async () => {
    await expect(getPageStudioDocument('tenant-a', 'site-a')).rejects.toMatchObject({ code: 'CHECKPOINT_UNAVAILABLE' })
    database.queryOneFresh.mockResolvedValueOnce({ ...row, checkpoint_digest: null })
    await expect(getPageStudioDocument('tenant-a', 'site-a', bucket())).rejects.toMatchObject({ code: 'CHECKPOINT_UNAVAILABLE' })
    await expect(getPageStudioDocument('tenant-a', 'site-a', { get: vi.fn().mockResolvedValue(null) })).rejects.toMatchObject({ code: 'CHECKPOINT_NOT_FOUND' })
    database.queryOneFresh.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(getPageStudioDocument('tenant-a', 'site-a', bucket())).rejects.toThrow('Database unavailable')
  })

  it('does not read R2 for a missing or out-of-scope site', async () => {
    database.queryOneFresh.mockResolvedValue(null)
    const storage = bucket()
    await expect(getPageStudioDocument('other-tenant', 'site-a', storage)).rejects.toMatchObject({ code: 'SITE_NOT_FOUND', statusCode: 404 })
    expect(storage.get).not.toHaveBeenCalled()
  })

  it('rejects an old editor save under the same site lock used by checkpoint commits', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [row] }) }
    await expect(savePageStudioDocument(db, {
      actorId: 'actor', document: defaultPageStudioDocument('Old placeholder'),
      expectedRevision: 0, siteId: 'site-a', tenantId: 'tenant-a'
    })).rejects.toMatchObject({ code: 'STUDIO_DOCUMENT_REQUIRED', statusCode: 409 })
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE OF site, entitlement')
    expect(db.query.mock.calls[0][0]).not.toContain('FOR UPDATE OF site, entitlement, draft')
    await expect(replayPageStudioDocumentSave(db, 'tenant-a', 'site-a')).rejects.toMatchObject({ code: 'STUDIO_DOCUMENT_REQUIRED' })
  })
})

describe('Shared immutable checkpoint reader', () => {
  it('retains the entire manifest for approved releases', async () => {
    database.queryOne.mockResolvedValue({ checkpoint_id: 'saved', checkpoint_digest: digest, version_digest: digest, object_key: key })
    const result = await loadApprovedPageStudioReleaseCheckpoint({ scope, versionId: 'approved', bucket: bucket() })
    expect(result.manifest).toEqual(manifest)
    expect(result.releaseMetadata.defaultLocale).toBe('en-AU')
    expect(database.queryOne.mock.calls[0][0]).toContain('review.decision = \'approved\'')
  })
  it('still rejects an unapproved release or a mismatched version digest', async () => {
    database.queryOne.mockResolvedValueOnce(null)
    await expect(loadApprovedPageStudioReleaseCheckpoint({ scope, versionId: 'unapproved', bucket: bucket() })).rejects.toMatchObject({ code: 'VERSION_NOT_APPROVED' })
    database.queryOne.mockResolvedValue({ checkpoint_id: 'saved', checkpoint_digest: digest, version_digest: 'wrong', object_key: key })
    await expect(loadApprovedPageStudioReleaseCheckpoint({ scope, versionId: 'approved', bucket: bucket() })).rejects.toMatchObject({ code: 'CHECKPOINT_DIGEST_MISMATCH' })
  })
  it('rejects a cross-client key before touching storage', async () => {
    const storage = bucket()
    await expect(loadPageStudioCheckpoint({ scope, bucket: storage, checkpointId: 'saved', objectKey: key.replace('client-a', 'client-b'), digests: [digest] })).rejects.toMatchObject({ code: 'CHECKPOINT_KEY_MISMATCH' })
    expect(storage.get).not.toHaveBeenCalled()
  })
  it.each(['tenantId', 'clientId', 'siteId'])('rejects an envelope from another %s', async (field) => {
    await expect(read({ ...envelope, scope: { ...scope, [field]: 'other' } })).rejects.toMatchObject({ code: 'CHECKPOINT_SCOPE_MISMATCH' })
  })
  it('rejects a wrong manifest site, corrupt digest and malformed JSON', async () => {
    await expect(read({ ...envelope, manifest: { ...manifest, id: 'other' } })).rejects.toMatchObject({ code: 'MANIFEST_SITE_MISMATCH' })
    await expect(read({ ...envelope, digest: 'wrong' })).rejects.toMatchObject({ code: 'CHECKPOINT_DIGEST_MISMATCH' })
    await expect(loadPageStudioCheckpoint({ scope, checkpointId: 'saved', objectKey: key, digests: [digest], bucket: { get: async () => ({ body: new Response('{broken').body! }) } })).rejects.toMatchObject({ code: 'CHECKPOINT_INVALID' })
  })
  it('bounds streamed UTF-8 bytes even without a declared object size', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ pull(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1))
    }, cancel })
    await expect(loadPageStudioCheckpoint({ scope, checkpointId: 'saved', objectKey: key, digests: [digest], bucket: { get: async () => ({ body }) } })).rejects.toMatchObject({ code: 'CHECKPOINT_TOO_LARGE' })
    expect(cancel).toHaveBeenCalled()
  })
})
