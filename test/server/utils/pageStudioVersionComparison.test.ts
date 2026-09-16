import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), checkpoint: vi.fn() }))
vi.mock('~~/shared/pageStudio/checkpointReader', () => ({ loadPageStudioCheckpoint: mocks.checkpoint }))
const { readPageStudioVersionComparison: read } = await import('~~/workers/page-studio-management/src/versionComparison')
const readPageStudioVersionComparison = (input: Parameters<typeof read>[0]) => read(input, mocks.query)
const row = () => ({ site_id: 'site', tenant_id: 'tenant', client_id: 'client', site_name: 'Site',
  version_id: 'version', checkpoint_id: 'cp', digest: 'digest', checkpoint_digest: 'digest', object_key: 'object',
  status: 'in_review', summary: 'Change', author_id: 'author', author_role: 'agency', created_at: '2026-09-16T00:00:00Z',
  current_version_id: 'version', current_checkpoint_id: 'cp',
  releases: [{ releaseId: 'live', hostname: 'example.test', checkpointId: 'live_cp', digest: 'live_digest', checkpointDigest: 'live_digest', objectKey: 'live_object' }] })
const input = { tenantId: 'tenant', siteId: 'site', versionId: 'version', bucket: { get: vi.fn() } }
describe('version comparison authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue(row())
    mocks.checkpoint.mockImplementation(async x => ({ checkpointId: x.checkpointId, digest: x.digests[0], manifest: { checkpoint: x.checkpointId } }))
  })
  it('loads selected and live content through the scoped digest verifier without exposing keys', async () => {
    const result = await readPageStudioVersionComparison(input)
    expect(result).toMatchObject({ version: { id: 'version', current: true, authorId: 'author' }, live: { releaseId: 'live', hostname: 'example.test' }, before: { checkpoint: 'live_cp' }, after: { checkpoint: 'cp' } })
    expect(JSON.stringify(result)).not.toContain('objectKey')
    expect(mocks.query.mock.calls[0][1]).toEqual(['tenant', 'site', 'version'])
    expect(mocks.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' }, checkpointId: 'cp', digests: ['digest', 'digest'] }))
  })
  it('distinguishes no live release from unavailable live storage', async () => {
    mocks.query.mockResolvedValue({ ...row(), releases: [] })
    expect(await readPageStudioVersionComparison(input)).toMatchObject({ live: null, before: null })
    mocks.query.mockResolvedValue(row())
    mocks.checkpoint.mockRejectedValue(new Error('storage unavailable'))
    await expect(readPageStudioVersionComparison(input)).rejects.toThrow('storage unavailable')
  })
  it('refuses a foreign release or missing scoped version before reading content', async () => {
    await expect(readPageStudioVersionComparison({ ...input, releaseId: 'foreign' })).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.checkpoint).not.toHaveBeenCalled()
    mocks.query.mockResolvedValue(null)
    await expect(readPageStudioVersionComparison(input)).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each([{ current_checkpoint_id: 'new' }, { current_version_id: 'new' }, { releases: [] }, { status: 'approved' }])('fails closed if state changes while content loads: %j', async (change) => {
    mocks.query.mockResolvedValueOnce(row()).mockResolvedValue({ ...row(), ...change })
    await expect(readPageStudioVersionComparison(input)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('allows inspection but no decision for a historical checkpoint', async () => {
    mocks.query.mockResolvedValue({ ...row(), current_checkpoint_id: 'new' })
    expect((await readPageStudioVersionComparison(input)).version.current).toBe(false)
  })
  it('rejects missing bindings explicitly', async () => {
    await expect(readPageStudioVersionComparison({ ...input, bucket: undefined })).rejects.toMatchObject({ statusCode: 503 })
  })
})
