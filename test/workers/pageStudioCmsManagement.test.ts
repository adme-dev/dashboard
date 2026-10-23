import { nativePreviewBindings } from '../utils/pageStudioNativePreview'
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
  it('routes native customer source to dedicated storage and leaves legacy and production unchanged', async () => {
    const f = fixture(), bindings = nativePreviewBindings()
    const env = { ...f.env, ...bindings, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production' }
    const principal = { source: 'customer-session', capability: 'cms:adopt', claims: {
      role: 'customer', environment: 'staging', nonce: id, userId: id, workspaceId: id, clientId: id, siteId: id, tenantId: 'native',
      issuedAt: 1792195200, expiresAt: 1792195800, capabilities: ['cms:prepare', 'cms:adopt'],
      editorOrigin: 'https://source.example.test', returnUrl: 'https://customers.example.test/studio/dashboard' } }
    const request = { ...f.request, principal }
    expect((await handleCmsManagement(request, env, f.run)).ok).toBe(true)
    expect(operations.adoption.mock.lastCall![1].env.PAGE_STUDIO_CONTENT_ROUTER).toBe(bindings.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER)
    expect(operations.adoption.mock.lastCall![1].env.PAGE_STUDIO_CHECKPOINTS).toBe(bindings.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS)
    expect((await handleCmsManagement(f.request, env, f.run)).ok).toBe(true)
    expect(operations.adoption.mock.lastCall![1].request.env.PAGE_STUDIO_CONTENT_ROUTER).toBe(f.stagingRouter)
    const production = { ...request, contentEnvironment: 'production', principal: { ...principal, capability: 'workspace:create', claims: { ...principal.claims, environment: 'production', capabilities: ['workspace:create', 'workspace:reconnect', 'workspace:checkpoint', 'workspace:preview', 'workspace:terminate', 'workspace:status'] } } }
    expect((await handleCmsManagement(production, env, f.run)).ok).toBe(true)
    expect(operations.adoption.mock.lastCall![1].env.PAGE_STUDIO_CONTENT_ROUTER).toBe(f.productionRouter)
    expect((await handleCmsManagement(request, { ...env, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: undefined }, f.run)).ok).toBe(false)
    expect((await handleCmsManagement(request, f.env, f.run)).ok).toBe(false)
    expect((await handleCmsManagement({ ...request, contentEnvironment: 'production' }, env, f.run)).ok).toBe(false)
    operations.adoption.mockRejectedValueOnce(Object.assign(new Error('Native owner revoked'), { statusCode: 403 }))
    expect(await handleCmsManagement(request, env, f.run)).toMatchObject({ ok: false, error: { statusCode: 403 } })
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
  it('reports a bounded failure stage without logging private error values', async () => {
    const f = fixture()
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      operations.adoption.mockRejectedValue(Object.assign(new Error('postgres://secret'), { code: '42P01' }))
      await handleCmsManagement(f.request, f.env, f.run)
      expect(log).toHaveBeenCalledWith('page-studio-cms-management-failed', {
        operation: 'adoption', stage: 'coordinate', category: 'database-schema'
      })
      expect(JSON.stringify(log.mock.calls)).not.toContain('postgres')
      log.mockClear()
      operations.adoption.mockResolvedValue({ privateValue: 'secret' })
      await handleCmsManagement(f.request, f.env, f.run)
      expect(log).toHaveBeenCalledWith('page-studio-cms-management-failed', {
        operation: 'adoption', stage: 'result', category: 'validation'
      })
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
    } finally {
      log.mockRestore()
    }
  })
})
