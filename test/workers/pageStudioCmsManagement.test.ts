import { describe, expect, it, vi } from 'vitest'
import { PageStudioBusinessContentError } from '~~/server/utils/pageStudio/businessContent'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { handleCmsManagement } from '../../workers/page-studio-management/src/cmsManagement'

const operations = vi.hoisted(() => ({ adoption: vi.fn(), checkpoint: vi.fn(), transition: vi.fn(), restore: vi.fn() }))
vi.mock('../../workers/page-studio-management/src/cms/adoptionCoordinator', () => ({ coordinateCmsAdoption: operations.adoption }))
vi.mock('../../workers/page-studio-management/src/cms/graphMutations', () => ({ coordinateCmsGraphCheckpoint: operations.checkpoint, coordinateCmsGraphTransition: operations.transition, coordinateCmsGraphRestore: operations.restore }))
const id = '10000000-0000-4000-8000-000000000001'
function fixture() {
  const request = { operation: 'adoption', body: { action: 'status' }, expectedEnvironment: 'production', contentEnvironment: 'staging',
    principal: { source: 'native-login', request: { siteId: id, actor: { role: 'agency', actorId: id, tenantId: 'test', canEdit: true },
      login: { role: 'agency', userId: id, tokenHash: 'a'.repeat(64), issuedAt: '2026-10-16T00:00:00.000Z', expiresAt: '2026-10-17T00:00:00.000Z' } } } }
  const stagingRouter = { readManagedCmsTarget() {} }, productionRouter = { readManagedCmsTarget() {} }
  const stagingBucket = { get() {} }, productionBucket = { get() {} }
  const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ROUTER: productionRouter,
    PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: stagingRouter, PAGE_STUDIO_CHECKPOINTS: productionBucket, PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: stagingBucket }
  const run = vi.fn()
  const value = { phase: 'idle', adoptionId: null, progress: null, recoveryId: null, recoveryRequired: false, recoveryReason: null,
    receiptDigest: null, application: null, progressDigest: 'a'.repeat(64) }
  operations.adoption.mockReset().mockResolvedValue(value)
  return { request, env, run, value, stagingRouter, stagingBucket, productionRouter, productionBucket }
}
describe('CMS management invocation boundary', () => {
  it('keeps production control authority separate from staging storage', async () => {
    const f = fixture()
    expect(await handleCmsManagement(f.request, f.env, f.run)).toEqual({ ok: true, requestDigest: await collectionDigest(f.request), value: f.value })
    const principal = operations.adoption.mock.calls[0]![1]
    expect(principal.request.env.PAGE_STUDIO_CONTENT_ROUTER).toBe(f.stagingRouter)
    expect(principal.request.env.PAGE_STUDIO_CHECKPOINTS).toBe(f.stagingBucket)
    expect(principal.request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT).toBe('production')
    expect(principal.request.login.issuedAt).toBeInstanceOf(Date)
  })
  it('uses production storage only for the exact production content environment', async () => {
    const f = fixture()
    f.request.contentEnvironment = 'production'
    expect((await handleCmsManagement(f.request, f.env, f.run)).ok).toBe(true)
    expect(operations.adoption.mock.calls[0]![1].request.env.PAGE_STUDIO_CONTENT_ROUTER).toBe(f.productionRouter)
  })
  it.each(['deployment', 'staging-production', 'missing-storage', 'extra-principal'])('denies %s before authority or provider work', async (kind) => {
    const f = fixture()
    if (kind === 'deployment') f.request.expectedEnvironment = 'staging'
    if (kind === 'staging-production') {
      f.env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
      f.request.expectedEnvironment = 'staging'
      f.request.contentEnvironment = 'production'
    }
    if (kind === 'missing-storage') delete (f.env as Partial<typeof f.env>).PAGE_STUDIO_CMS_STAGING_CHECKPOINTS
    if (kind === 'extra-principal') (f.request.principal as unknown as Record<string, unknown>).env = { PAGE_STUDIO_CONTENT_ROUTER: {} }
    expect((await handleCmsManagement(f.request, f.env, f.run)).ok).toBe(false)
    expect(operations.adoption).not.toHaveBeenCalled()
    expect(f.run).not.toHaveBeenCalled()
  })
  it('preserves typed graph conflicts without replay', async () => {
    const f = fixture()
    operations.adoption.mockRejectedValue(new PageStudioBusinessContentError('CMS_GRAPH_CONFLICT', 409, 'The current content graph changed.'))
    expect(await handleCmsManagement(f.request, f.env, f.run)).toEqual({ ok: false, requestDigest: await collectionDigest(f.request),
      error: { code: 'CMS_GRAPH_CONFLICT', statusCode: 409, message: 'The current content graph changed.' } })
    expect(operations.adoption).toHaveBeenCalledOnce()
  })
  it('preserves revocation status while redacting authority internals', async () => {
    const f = fixture()
    operations.adoption.mockRejectedValue(Object.assign(new Error('Private session lookup'), { statusCode: 403 }))
    expect(await handleCmsManagement(f.request, f.env, f.run)).toEqual({ ok: false, requestDigest: await collectionDigest(f.request),
      error: { code: 'CMS_AUTHORITY_DENIED', statusCode: 403, message: 'CMS mutation access denied' } })
    expect(operations.adoption).toHaveBeenCalledOnce()
  })
  it('does not expose unexpected errors or replay calls', async () => {
    const f = fixture()
    operations.adoption.mockRejectedValue(new Error('postgres://secret'))
    const result = await handleCmsManagement(f.request, f.env, f.run)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('postgres')
    expect(operations.adoption).toHaveBeenCalledOnce()
  })
})
