import { createApp, createError, createRouter, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), authority: vi.fn(), build: vi.fn(), target: vi.fn(),
  worker: vi.fn(), verifyBuild: vi.fn(), verifyRelease: vi.fn(), activate: vi.fn(), rollback: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({}))
vi.mock('~~/server/utils/pageStudio/customerSignupEmail', () => ({}))
vi.mock('~~/server/utils/rateLimit', () => ({}))
vi.mock('~~/server/utils/portalSession', () => ({}))
vi.mock('~~/server/utils/pageStudio/customerPublishAuthority', () => ({ prepareCustomerPublishPrincipal: mocks.prepare }))
vi.mock('~~/server/utils/pageStudio/customerReleaseAuthority', () => ({ withCustomerReleaseAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/publishing', async () => ({
  PageStudioPublishingError: (await import('~~/server/utils/pageStudio/publishingError')).PageStudioPublishingError,
  getPageStudioBuildPointer: mocks.build, getPageStudioReleasePointer: mocks.target,
  resolvePageStudioDeliveryWorker: mocks.worker, activatePageStudioRelease: mocks.activate,
  rollbackPageStudioRelease: mocks.rollback
}))
vi.stubGlobal('eventHandler', eventHandler)
vi.stubGlobal('createError', createError)

const siteId = '10000000-0000-4000-8000-000000000001'
const scope = { tenantId: 'native-tenant', clientId: '10000000-0000-4000-8000-000000000002', siteId }
const principal = { kind: 'customer', identityId: '10000000-0000-4000-8000-000000000003',
  accountId: '10000000-0000-4000-8000-000000000004', workspaceId: '10000000-0000-4000-8000-000000000005', tokenHash: 'f'.repeat(64) }
const token = 'a'.repeat(64)
const base = { environment: 'production', hostname: 'www.customer.example', expectedActiveReleaseId: null, buildId: 'build-one' }
const restore = { environment: 'production', hostname: base.hostname, expectedActiveReleaseId: 'release-current', targetReleaseId: 'release-old' }
const pointer = { buildId: 'build-one', scope, astro: { context: { identity: { environment: 'production', source: { kind: 'approved-version' } } } } }
const { default: activate } = await import('~~/server/api/portal/page-studio/customer/sites/[siteId]/releases/activate.post')
const { default: rollback } = await import('~~/server/api/portal/page-studio/customer/sites/[siteId]/releases/rollback.post')
async function request(options: {
  action?: 'activate' | 'rollback'
  method?: string
  body?: string
  origin?: string
  cookie?: string
  key?: string
  query?: string
  site?: string
  contentType?: string
  enabled?: string
} = {}) {
  const action = options.action ?? 'activate'
  const router = createRouter().add('/sites/:siteId/releases/activate', activate, ['post', 'put'])
    .add('/sites/:siteId/releases/rollback', rollback, ['post', 'put'])
  const app = createApp().use(eventHandler((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: options.enabled ?? 'true',
      PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://app.example', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'test-v1',
      PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' } }
  })).use(router)
  return toWebHandler(app)(new Request(`https://app.example/sites/${options.site ?? siteId}/releases/${action}${options.query ?? ''}`, {
    method: options.method ?? 'POST', body: options.body ?? JSON.stringify(action === 'activate' ? base : restore), headers: {
      'host': 'app.example', 'x-forwarded-proto': 'https', 'origin': options.origin ?? 'https://app.example',
      'cookie': options.cookie ?? `__Host-studio_customer_session=${token}`,
      'content-type': options.contentType ?? 'application/json', 'idempotency-key': options.key ?? 'publish-one'
    }
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.prepare.mockResolvedValue({ scope, principal })
  mocks.authority.mockImplementation(async (_scope, _principal, _hostname, work) => work({}))
  mocks.build.mockResolvedValue(pointer)
  mocks.target.mockResolvedValue({ ...pointer, environment: 'production', releaseId: 'release-old' })
  mocks.worker.mockReturnValue({ verifyBuild: mocks.verifyBuild, verifyRelease: mocks.verifyRelease })
  mocks.activate.mockImplementation(async (_input, { runTransaction }) => runTransaction(async () => ({ releaseId: 'release-new' })))
  mocks.rollback.mockImplementation(async (_input, { runTransaction }) => runTransaction(async () => ({ releaseId: 'release-restored' })))
})
describe('Native customer static publication HTTP boundary', () => {
  it.each(['activate', 'rollback'] as const)('derives native identity and rechecks authority around %s verification', async (action) => {
    const response = await request({ action })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ release: { releaseId: action === 'activate' ? 'release-new' : 'release-restored' } })
    expect(mocks.prepare).toHaveBeenCalledWith(token, siteId)
    expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.authority).toHaveBeenCalledWith(scope, principal, base.hostname, expect.any(Function))
    const verify = action === 'activate' ? mocks.verifyBuild : mocks.verifyRelease
    expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(verify.mock.invocationCallOrder[0]!)
    expect(mocks.authority.mock.invocationCallOrder[1]).toBeGreaterThan(verify.mock.invocationCallOrder[0]!)
    expect(mocks[action]).toHaveBeenCalledWith({ ...(action === 'activate' ? base : restore), scope,
      actorId: principal.identityId, actorRole: 'customer', idempotencyKey: 'publish-one' }, expect.anything())
  })
  it.each(['', 'portal_session=valid', `studio_customer_session=${token}`, '__Host-studio_customer_session=bad'])('requires the host-only native cookie: %s', async (cookie) => {
    const response = await request({ cookie })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each(['https://other.example', 'null', ''])('rejects missing or foreign origin %s', async (origin) => {
    expect((await request({ origin })).status).toBe(403)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('requires the configured native entry point and POST', async () => {
    expect((await request({ enabled: 'false' })).status).toBe(404)
    expect((await request({ method: 'PUT' })).status).toBe(405)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each([{ site: 'bad' }, { query: '?tenantId=foreign' }, { key: '' }])('rejects invalid path/header/query', async (options) => {
    expect((await request(options)).status).toBe(400)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each([{ ...base, actorRole: 'agency' }, { ...base, actorId: principal.identityId }, { ...base, tenantId: scope.tenantId },
    { ...base, scope }, { ...base, environment: 'staging' }, { ...base, expectedActiveReleaseId: undefined }])('rejects caller-supplied authority or incomplete publication input', async (body) => {
    expect((await request({ body: JSON.stringify(body) })).status).toBe(400)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('bounds observed JSON bytes and rejects malformed or wrong media type', async () => {
    expect((await request({ body: 'x'.repeat(2049) })).status).toBe(413)
    expect((await request({ body: '{bad' })).status).toBe(400)
    expect((await request({ contentType: 'text/plain' })).status).toBe(415)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each(['prepare', 'authority'] as const)('does not inspect artifacts or delivery when %s denies current access', async (phase) => {
    mocks[phase].mockRejectedValue(createError({ statusCode: 403 }))
    expect((await request()).status).toBe(403)
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.worker).not.toHaveBeenCalled()
  })
  it.each(['activate', 'rollback'] as const)('rejects revoked authority during remote %s verification', async (action) => {
    const verify = action === 'activate' ? mocks.verifyBuild : mocks.verifyRelease
    verify.mockImplementation(async () => mocks.authority.mockRejectedValueOnce(createError({ statusCode: 403 })))
    const response = await request({ action })
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain(principal.tokenHash)
  })
  it.each([null, { ...pointer, astro: undefined },
    { ...pointer, astro: { context: { identity: { environment: 'staging', source: { kind: 'approved-version' } } } } },
    { ...pointer, astro: { context: { identity: { environment: 'production', source: { kind: 'draft' } } } } }])('requires an approved production artifact', async (build) => {
    mocks.build.mockResolvedValue(build)
    const response = await request()
    expect(response.status).toBe(422)
    expect(mocks.verifyBuild).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it.each([null, { ...pointer, environment: 'staging' }, { ...pointer, environment: 'production', astro: undefined },
    { ...pointer, environment: 'production', astro: { context: { identity: { environment: 'production', source: { kind: 'draft' } } } } }])('requires a retained approved production rollback target', async (target) => {
    mocks.target.mockResolvedValue(target)
    expect((await request({ action: 'rollback' })).status).toBe(422)
    expect(mocks.verifyRelease).not.toHaveBeenCalled()
    expect(mocks.rollback).not.toHaveBeenCalled()
  })
  it.each(['activate', 'rollback'] as const)('does not %s after delivery verification fails', async (action) => {
    const verify = action === 'activate' ? mocks.verifyBuild : mocks.verifyRelease
    verify.mockRejectedValue(new Error('private provider detail'))
    const response = await request({ action })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private provider detail')
    expect(mocks[action]).not.toHaveBeenCalled()
  })
})
