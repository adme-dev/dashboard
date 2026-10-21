import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePortalPageStudioPublishing } from '~~/server/utils/pageStudio/portalPublishing'

type RequestFixture = { siteId: string, headers: Record<string, string>, query?: Record<string, string> }

const mocks = vi.hoisted(() => ({ auth: vi.fn(), body: vi.fn(), tenant: vi.fn(), prepare: vi.fn(), authority: vi.fn(),
  build: vi.fn(), target: vi.fn(), verifyBuild: vi.fn(), verifyRelease: vi.fn(), activate: vi.fn(), rollback: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(),
  assertMethod: () => {}, setHeader: vi.fn(), getQuery: (event: RequestFixture) => event.query ?? {},
  getRouterParam: (event: RequestFixture) => event.siteId,
  getHeader: (event: RequestFixture, key: string) => event.headers[key],
  getRequestURL: () => new URL('https://xeroflowpages.com/api/portal/page-studio/sites/site/releases/activate')
}))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.auth(...args) }))
vi.mock('~~/server/utils/pageStudio/boundedJson', () => ({ readPageStudioJson: (...args: unknown[]) => mocks.body(...args) }))
vi.mock('~~/server/utils/pageStudio/versions', () => ({ resolvePortalPageStudioSiteTenant: (...args: unknown[]) => mocks.tenant(...args) }))
vi.mock('~~/server/utils/pageStudio/publishHttp', () => ({ preparePortalPageStudioPublishPrincipal: (...args: unknown[]) => mocks.prepare(...args) }))
vi.mock('~~/server/utils/pageStudio/portalReleaseAuthority', () => ({ withPortalPageStudioReleaseAuthority: (...args: unknown[]) => mocks.authority(...args) }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioHttpError: (error: unknown) => {
  throw error
} }))
vi.mock('~~/server/utils/pageStudio/publishing', () => ({
  getPageStudioBuildPointer: (...args: unknown[]) => mocks.build(...args),
  getPageStudioReleasePointer: (...args: unknown[]) => mocks.target(...args),
  resolvePageStudioDeliveryWorker: () => ({ verifyBuild: mocks.verifyBuild, verifyRelease: mocks.verifyRelease }),
  activatePageStudioRelease: (...args: unknown[]) => mocks.activate(...args),
  rollbackPageStudioRelease: (...args: unknown[]) => mocks.rollback(...args)
}))

const siteId = '10000000-0000-4000-8000-000000000001'
const user = { id: '10000000-0000-4000-8000-000000000002', clientId: '10000000-0000-4000-8000-000000000003' }
const scope = { tenantId: 'tenant-one', clientId: user.clientId, siteId }
const principal = { actorId: user.id, tenantId: scope.tenantId, login: { role: 'client' } }
const base = { environment: 'production', hostname: 'www.customer.example', expectedActiveReleaseId: null, buildId: 'build-one' }
const pointer = { buildId: 'build-one', scope, astro: { context: { identity: { environment: 'production', source: { kind: 'approved-version' } } } } }
const event = () => ({ siteId, headers: { 'origin': 'https://xeroflowpages.com', 'idempotency-key': 'publish-one' } })
const invoke = (action: 'activate' | 'rollback' = 'activate', value = event()) => handlePortalPageStudioPublishing(value as never, action)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(user)
  mocks.tenant.mockResolvedValue(scope.tenantId)
  mocks.body.mockResolvedValue(base)
  mocks.prepare.mockResolvedValue(principal)
  mocks.verifyBuild.mockReset().mockResolvedValue(undefined)
  mocks.verifyRelease.mockReset().mockResolvedValue(undefined)
  mocks.authority.mockImplementation(async (_scope, _principal, _host, work) => work({}))
  mocks.build.mockResolvedValue(pointer)
  mocks.target.mockResolvedValue({ ...pointer, releaseId: 'release-old', environment: 'production' })
  mocks.activate.mockImplementation(async (_input, { runTransaction }) => runTransaction(async () => ({ releaseId: 'release-new' })))
  mocks.rollback.mockImplementation(async (_input, { runTransaction }) => runTransaction(async () => ({ releaseId: 'release-old' })))
})

describe('Customer static publication HTTP boundary', () => {
  it('requires a portal login before reading request bodies or resolving sites', async () => {
    mocks.auth.mockRejectedValue({ statusCode: 401 })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.body).not.toHaveBeenCalled()
    expect(mocks.tenant).not.toHaveBeenCalled()
  })
  it.each([
    { ...event(), siteId: 'invalid' },
    { ...event(), query: { tenantId: 'foreign' } },
    { ...event(), headers: { 'origin': 'https://xeroflowpages.com', 'idempotency-key': '' } }
  ])('rejects invalid path, query or idempotency before artifact reads', async (request) => {
    await expect(invoke('activate', request)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.tenant).not.toHaveBeenCalled()
  })
  it.each(['activate', 'rollback'] as const)('authenticates before parsing %s and retains the exact bounded reader contract', async (action) => {
    const body = action === 'activate' ? base : { environment: 'production', hostname: base.hostname, expectedActiveReleaseId: 'release-current', targetReleaseId: 'release-old' }
    mocks.body.mockResolvedValue(body)
    await invoke(action)
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.body.mock.invocationCallOrder[0]!)
    expect(mocks.body).toHaveBeenCalledWith(expect.anything(), 2048, [
      'Website publication requires JSON', 'Website publication request is too large',
      'Website publication request is required', 'Invalid website publication body', 'Invalid website publication JSON'
    ])
    vi.clearAllMocks()
    mocks.body.mockResolvedValue({ ...body, scope })
    await expect(invoke(action)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.tenant).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.target).not.toHaveBeenCalled()
  })
  it('derives account/scope and checks access before remote verification and again for activation', async () => {
    await expect(invoke()).resolves.toEqual({ release: { releaseId: 'release-new' } })
    expect(mocks.tenant).toHaveBeenCalledWith({ clientId: user.clientId, userId: user.id, siteId })
    expect(mocks.activate).toHaveBeenCalledWith({ ...base, actorId: user.id, actorRole: 'client', scope, idempotencyKey: 'publish-one' }, expect.anything())
    expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(mocks.verifyBuild.mock.invocationCallOrder[0]!)
    expect(mocks.authority.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.verifyBuild.mock.invocationCallOrder[0]!)
  })
  it('does not read artifacts when current membership or domain authority is denied', async () => {
    mocks.authority.mockRejectedValue({ statusCode: 403 })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.verifyBuild).not.toHaveBeenCalled()
  })
  it('rechecks access after remote verification rather than borrowing an earlier grant', async () => {
    mocks.verifyBuild.mockImplementation(async () => {
      mocks.authority.mockRejectedValueOnce({ statusCode: 403 })
    })
    await expect(invoke()).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['https://foreign.example', 'null', ''])('rejects cross-origin or missing Origin: %s', async (origin) => {
    await expect(invoke('activate', { ...event(), headers: { ...event().headers, origin } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it.each([{ ...base, actorRole: 'agency' }, { ...base, tenantId: 'foreign' }, { ...base, clientId: user.clientId }, { ...base, environment: 'staging' }, { ...base, expectedActiveReleaseId: undefined }])('rejects untrusted authority or incomplete production input', async (body) => {
    mocks.body.mockResolvedValue(body)
    await expect(invoke()).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it.each([null, { ...pointer, astro: undefined }, { ...pointer, astro: { context: { identity: { environment: 'staging', source: { kind: 'approved-version' } } } } }])('rejects missing or unapproved production artifacts', async (value) => {
    mocks.build.mockResolvedValue(value)
    await expect(invoke()).rejects.toMatchObject({ code: 'BUILD_NOT_PUBLISHABLE' })
    expect(mocks.verifyBuild).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it('does not activate after delivery verification fails', async () => {
    mocks.verifyBuild.mockRejectedValue(new Error('Invalid artifact'))
    await expect(invoke()).rejects.toThrow('Invalid artifact')
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it('restores a scoped approved production release with the same authority checks', async () => {
    mocks.body.mockResolvedValue({ environment: 'production', hostname: base.hostname, expectedActiveReleaseId: 'release-current', targetReleaseId: 'release-old' })
    await expect(invoke('rollback')).resolves.toEqual({ release: { releaseId: 'release-old' } })
    expect(mocks.target).toHaveBeenCalledWith(scope, 'release-old')
    expect(mocks.verifyRelease).toHaveBeenCalledOnce()
    expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.rollback).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'client', actorId: user.id, scope }), expect.anything())
  })
  it.each([
    null,
    { ...pointer, environment: 'staging' },
    { ...pointer, environment: 'production', astro: undefined },
    { ...pointer, environment: 'production', astro: { context: { identity: { environment: 'production', source: { kind: 'draft' } } } } }
  ])('rejects a rollback without a retained approved production artifact', async (target) => {
    mocks.body.mockResolvedValue({ environment: 'production', hostname: base.hostname, expectedActiveReleaseId: 'release-current', targetReleaseId: 'release-old' })
    mocks.target.mockResolvedValue(target)
    await expect(invoke('rollback')).rejects.toMatchObject({ code: 'ROLLBACK_TARGET_INVALID' })
    expect(mocks.verifyRelease).not.toHaveBeenCalled()
    expect(mocks.rollback).not.toHaveBeenCalled()
  })
  it('does not restore a release when remote artifact verification fails', async () => {
    mocks.body.mockResolvedValue({ environment: 'production', hostname: base.hostname, expectedActiveReleaseId: 'release-current', targetReleaseId: 'release-old' })
    mocks.verifyRelease.mockRejectedValue(new Error('Invalid artifact'))
    await expect(invoke('rollback')).rejects.toThrow('Invalid artifact')
    expect(mocks.rollback).not.toHaveBeenCalled()
  })
})
