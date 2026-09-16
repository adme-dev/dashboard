import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn(), checkpoint: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query }))
vi.mock('~~/server/utils/pageStudio/releaseCheckpoint', () => ({ loadPageStudioCheckpoint: mocks.checkpoint }))
const { readPageStudioLaunchState } = await import('~~/server/utils/pageStudio/launchState')

const row = () => ({
  id: 'site_one', tenant_id: 'tenant_one', client_id: 'client_one', name: 'Example', status: 'active',
  checkpoint_id: 'checkpoint_current', checkpoint_digest: 'digest_current', object_key: 'scoped_object',
  version_id: 'version_current', version_checkpoint_id: 'checkpoint_current', version_digest: 'digest_current',
  version_status: 'approved', review_decision: 'approved', review_digest: 'digest_current',
  plan_key: 'trial', plan_status: 'trial', plan_current: true,
  active_releases: [{ id: 'release_current', hostname: 'example.test', activatedAt: '2026-09-16T00:00:00Z' }]
})
const scope = { tenantId: 'tenant_one', siteId: 'site_one', bucket: { get: vi.fn() } }

describe('site launch state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue(row())
    mocks.checkpoint.mockResolvedValue({ checkpointId: 'checkpoint_current', digest: 'digest_current', manifest: {
      schemaVersion: 2, pages: [
        { id: 'page_home', title: 'Home', route: '/', visibility: 'public', seo: {}, forms: [{ id: 'form_contact' }] },
        { id: 'page_draft', title: 'Draft', route: '/draft', visibility: 'draft', seo: {}, forms: [] }
      ]
    } })
  })
  it('reports the exact saved and approved version with scoped public form counts', async () => {
    const result = await readPageStudioLaunchState(scope)
    expect(result).toMatchObject({ siteId: 'site_one', checkpointId: 'checkpoint_current', digest: 'digest_current',
      approvedVersionId: 'version_current', content: { status: 'ready', publicPages: 1, publicForms: 1 },
      plan: { status: 'ready', key: 'trial' }, activeReleases: row().active_releases })
    expect(mocks.checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      scope: { tenantId: 'tenant_one', clientId: 'client_one', siteId: 'site_one' },
      checkpointId: 'checkpoint_current', digests: ['digest_current']
    }))
  })
  it.each([
    { version_checkpoint_id: 'checkpoint_old' }, { version_digest: 'digest_old' },
    { review_digest: 'digest_old' }, { review_decision: 'rejected' },
    { version_status: 'in_review' }, { version_id: null }
  ])('does not treat a historical or revoked review as current approval: %j', async (change) => {
    mocks.query.mockResolvedValue({ ...row(), ...change })
    expect((await readPageStudioLaunchState(scope)).approvedVersionId).toBeNull()
  })
  it('reports missing storage as unavailable instead of ready or empty', async () => {
    const result = await readPageStudioLaunchState({ ...scope, bucket: undefined })
    expect(result.content.status).toBe('unavailable')
    expect(result.approvedVersionId).toBeNull()
    expect(mocks.checkpoint).not.toHaveBeenCalled()
  })
  it('rejects an unknown scoped site without loading any object', async () => {
    mocks.query.mockResolvedValue(null)
    await expect(readPageStudioLaunchState(scope)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.checkpoint).not.toHaveBeenCalled()
  })
  it('invalidates approval if the saved head changes while its content loads', async () => {
    mocks.query.mockResolvedValueOnce(row()).mockResolvedValue({ ...row(), checkpoint_id: 'checkpoint_newer' })
    await expect(readPageStudioLaunchState(scope)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('requires a refresh if an active release changes while content loads', async () => {
    mocks.query.mockResolvedValueOnce(row()).mockResolvedValue({ ...row(), active_releases: [] })
    await expect(readPageStudioLaunchState(scope)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('does not present expired or suspended access as ready', async () => {
    mocks.query.mockResolvedValue({ ...row(), plan_current: false, plan_status: 'cancelled' })
    const result = await readPageStudioLaunchState(scope)
    expect(result.plan.status).toBe('required')
    expect(result.approvedVersionId).toBeNull()
  })
  it('keeps malformed or unavailable checkpoints distinct from no saved content', async () => {
    mocks.checkpoint.mockRejectedValue(new Error('Private storage diagnostic'))
    const result = await readPageStudioLaunchState(scope)
    expect(result.content.status).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain('Private storage diagnostic')
  })
})
