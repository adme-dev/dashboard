import { beforeEach, describe, expect, it, vi } from 'vitest'
import Management from '../../workers/page-studio-management/src/index'
import { pageStudioStagingAddress } from '../../shared/pageStudio/staging'
import { StagingStoreError } from '../../workers/page-studio-management/src/stagingStore'

const mocks = vi.hoisted(() => ({ coordinate: vi.fn(), transaction: vi.fn() }))
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../workers/page-studio-management/src/stagingCoordinator', () => ({ coordinateStaging: vi.fn(), coordinateCheckpointStaging: mocks.coordinate }))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: mocks.transaction }))
const scope = { tenantId: 'tenant_a', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }
const request = { scope, auditId: '33333333-3333-4333-8333-333333333333', checkpointId: 'checkpoint_saved', digest: 'a'.repeat(64), expectedEnvironment: 'staging' }
const state = { siteId: scope.siteId, ...pageStudioStagingAddress(scope.siteId), status: 'not_published', canManage: true, active: null, currentDigest: request.digest, failure: null }
const environment = () => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', HYPERDRIVE_FRESH: { connectionString: 'isolated-test-only' },
  PAGE_STUDIO_CLIENT_STAGING: { buildSnapshot: vi.fn(), verifySnapshot: vi.fn() } })
const unavailable = { ok: false, error: { code: 'STAGING_SERVICE_UNAVAILABLE', statusCode: 503 } }
async function call(input: unknown = request, env: unknown = environment()) {
  const worker = new Management({} as never, env as never)
  const method = Reflect.get(worker, 'checkpointStaging')
  expect(method, 'Retained checkpoint staging needs a private service endpoint').toBeTypeOf('function')
  return method.call(worker, input)
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.coordinate.mockResolvedValue(state)
})

describe('private checkpoint staging service boundary', () => {
  it('uses exact configured environment and fresh SQL transport with retained request identity', async () => {
    expect(await call()).toEqual({ ok: true, request, value: state })
    expect(mocks.coordinate).toHaveBeenCalledExactlyOnceWith(request, 'staging', expect.any(Object))
    const work = vi.fn()
    await mocks.coordinate.mock.calls[0]![2].transaction(work)
    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith('isolated-test-only', expect.any(Function))
  })
  it.each([{}, { ...request, actor: { actorId: 'replacement' } }, { ...request, checkpointId: '' }, { ...request, auditId: 'invalid' }, { ...request, scope: { ...scope, hostname: 'foreign.example' } }])('rejects malformed or actor-bearing input before work', async (input) => {
    expect(await call(input)).toEqual({ ok: false, error: { code: 'STAGING_INVALID', statusCode: 400 } })
    expect(mocks.coordinate).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([{}, { ...environment(), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, { ...environment(), HYPERDRIVE_FRESH: undefined },
    { ...environment(), PAGE_STUDIO_CLIENT_STAGING: undefined }, { ...environment(), PAGE_STUDIO_CLIENT_STAGING: { buildSnapshot: vi.fn() } }])('rejects unavailable or mismatched runtime before any effect', async (env) => {
    expect(await call(request, env)).toEqual(unavailable)
    expect(mocks.coordinate).not.toHaveBeenCalled()
  })
  it('retains a bounded authority denial without retry', async () => {
    mocks.coordinate.mockRejectedValue(new StagingStoreError('STAGING_ACCESS_DENIED', 403))
    expect(await call()).toEqual({ ok: false, error: { code: 'STAGING_ACCESS_DENIED', statusCode: 403 } })
    expect(mocks.coordinate).toHaveBeenCalledOnce()
  })
  it.each([null, { ...state, secret: 'private' }, { ...state, siteId: request.auditId, ...pageStudioStagingAddress(request.auditId) }])('rejects malformed or foreign business state', async (value) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.coordinate.mockResolvedValue(value)
      expect(await call()).toEqual(unavailable)
    } finally { log.mockRestore() }
  })
  it('redacts provider/database failures and keeps public HTTP closed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.coordinate.mockRejectedValue(new Error('private credential'))
      expect(await call()).toEqual(unavailable)
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'page_studio_checkpoint_staging_failure', environment: 'staging' }))
      expect(new Management({} as never, environment() as never).fetch().status).toBe(404)
    } finally { log.mockRestore() }
  })
})
