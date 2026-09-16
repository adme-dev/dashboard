import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleInspection } from '../../workers/page-studio-management/src/inspection'
import { readPageStudioLaunchState, readPageStudioVersionComparison, listAgencyPageStudioReviews } from '../../server/utils/pageStudio/inspectionClient'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), launch: vi.fn(), comparison: vi.fn(), reviews: vi.fn() }))
vi.mock('../../workers/page-studio-management/src/reviews', () => ({ listAgencyPageStudioReviews: mocks.reviews }))
vi.mock('../../workers/page-studio-management/src/domainManagement', () => ({ agencyAuthority: mocks.authority }))
vi.mock('../../workers/page-studio-management/src/launchState', () => ({ readPageStudioLaunchState: mocks.launch }))
vi.mock('../../workers/page-studio-management/src/versionComparison', () => ({ readPageStudioVersionComparison: mocks.comparison }))
const actorId = '10000000-0000-4000-8000-000000000002', siteId = '10000000-0000-4000-8000-000000000001', versionId = '10000000-0000-4000-8000-000000000003'
const input = { actorId, siteId, tenantId: 'tenant' }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', HYPERDRIVE_FRESH: { connectionString: 'synthetic' }, PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() } }
const transaction = vi.fn(async work => work({ query: vi.fn() }))
const request = { ...input, operation: 'launch', expectedEnvironment: 'staging' }
const state = { siteId, content: { status: 'ready', publicPages: 1, publicForms: 0 }, plan: { status: 'ready', key: 'trial' }, activeReleases: [], approvedVersionId: null }
const service = vi.fn()
const client = () => ({ ...input, env: { ...env, PAGE_STUDIO_MANAGEMENT: { inspectWebsite: service } } })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authority.mockResolvedValue(false)
  mocks.launch.mockResolvedValue(state)
  mocks.reviews.mockResolvedValue([{ versionId, siteId }])
  mocks.comparison.mockResolvedValue({ siteId, version: { id: versionId, digest: 'digest', checkpointId: 'checkpoint', current: true }, releases: [], live: null, before: null, after: { id: siteId } })
  service.mockImplementation(value => handleInspection(value, env, transaction))
})
describe('private checkpoint inspection', () => {
  it('round-trips a fresh scoped launch read and rechecks staff permission', async () => {
    expect(await readPageStudioLaunchState(client())).toEqual(state)
    expect(mocks.authority).toHaveBeenCalledWith(expect.anything(), actorId, 'PAGE_STUDIO_VIEW')
    expect(mocks.launch.mock.calls[0][0].bucket).toBe(env.PAGE_STUDIO_CHECKPOINTS)
  })
  it('loads the tenant review list with fresh approve authority', async () => {
    const { siteId: _siteId, ...agency } = client()
    expect(await listAgencyPageStudioReviews(agency)).toEqual([{ versionId, siteId }])
    expect(mocks.authority).toHaveBeenCalledWith(expect.anything(), actorId, 'PAGE_STUDIO_APPROVE')
    expect(mocks.reviews).toHaveBeenCalledWith('tenant', expect.anything())
  })
  it('requires approve authority for the exact immutable comparison', async () => {
    expect(await readPageStudioVersionComparison({ ...client(), versionId })).toMatchObject({ siteId, version: { id: versionId } })
    expect(mocks.authority).toHaveBeenCalledWith(expect.anything(), actorId, 'PAGE_STUDIO_APPROVE')
  })
  it.each([null, { ...request, tenantId: '' }, { ...request, actorId: 'invalid' }, { ...request, extra: 'provider' }])('denies malformed input before database work', async (bad) => {
    expect(await handleInspection(bad, env, transaction)).toEqual({ ok: false, statusCode: 400 })
    expect(transaction).not.toHaveBeenCalled()
  })
  it.each([{ ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, { ...env, PAGE_STUDIO_CHECKPOINTS: undefined }, { ...env, HYPERDRIVE_FRESH: undefined }])('fails closed for environment/binding mismatch', async (bindings) => {
    expect(await handleInspection(request, bindings, transaction)).toEqual({ ok: false, statusCode: 503 })
    expect(transaction).not.toHaveBeenCalled()
  })
  it('does not load content after revoked staff access', async () => {
    mocks.authority.mockRejectedValue({ statusCode: 403 })
    await expect(readPageStudioLaunchState(client())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it.each(['siteId', 'tenantId', 'actorId', 'expectedEnvironment'])('refuses a mismatched %s in the result envelope', async (key) => {
    service.mockImplementation(value => ({ ok: true, payload: new TextEncoder().encode(JSON.stringify({ request: { ...value, [key]: 'foreign' }, value: state })) }))
    await expect(readPageStudioLaunchState(client())).rejects.toMatchObject({ statusCode: 503 })
  })
  it('refuses a foreign manifest despite matching transport scope', async () => {
    mocks.comparison.mockResolvedValue({ siteId, version: { id: versionId, current: true, digest: 'digest', checkpointId: 'cp' }, releases: [], live: null, before: null, after: { id: 'foreign' } })
    await expect(readPageStudioVersionComparison({ ...client(), versionId })).rejects.toMatchObject({ statusCode: 503 })
  })
  it('redacts unexpected database/storage failures and never retries', async () => {
    mocks.launch.mockRejectedValue(new Error('private database credentials'))
    await expect(readPageStudioLaunchState(client())).rejects.toMatchObject({ statusCode: 503 })
    expect(service).toHaveBeenCalledOnce()
  })
})
