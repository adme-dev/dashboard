import { createApp, createError, createRouter, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tenant: vi.fn(), principal: vi.fn(), authority: vi.fn(),
  services: vi.fn(), build: vi.fn(), preview: vi.fn(), session: vi.fn(), signing: vi.fn(), sign: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/versions', () => ({ resolvePortalPageStudioSiteTenant: mocks.tenant }))
vi.mock('~~/server/utils/pageStudio/publishHttp', () => ({ preparePortalPageStudioPublishPrincipal: mocks.principal }))
vi.mock('~~/server/utils/pageStudio/publishAuthority', () => ({ withPageStudioPublishAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/astroBuildHttp', () => ({ resolveAstroBuildServices: mocks.services }))
vi.mock('~~/server/utils/pageStudio/astroBuildCoordinator', () => ({ coordinateApprovedAstroBuild: mocks.build }))
vi.mock('~~/server/utils/pageStudio/astroCandidatePreview', () => ({ registerAstroCandidatePreview: mocks.preview }))
vi.mock('~~/server/utils/pageStudio/astroCandidateSession', () => ({ issueAstroCandidateSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({ resolvePageStudioSessionEnvironment: mocks.signing, signPageStudioSessionToken: mocks.sign }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioHttpError: (error: unknown) => {
  throw error
} }))
vi.stubGlobal('eventHandler', eventHandler)

const siteId = '10000000-0000-4000-8000-000000000001', versionId = '10000000-0000-4000-8000-000000000002'
const user = { id: '10000000-0000-4000-8000-000000000003', clientId: '10000000-0000-4000-8000-000000000004' }
const scope = { tenantId: 'tenant-one', clientId: user.clientId, siteId }
const principal = { actorId: user.id, tenantId: scope.tenantId, login: { role: 'client' } }
const services = { verifyBuild: vi.fn() }
const candidate = { build: { buildId: 'astro_candidate' }, preview: { hostname: 'candidate.review.example.invalid' }, session: { token: 'review-only-token' } }
const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/versions/[versionId]/candidate.post')
async function request(options: { body?: string | Uint8Array<ArrayBuffer>, origin?: string, contentType?: string, key?: string, query?: string, site?: string, version?: string, suffix?: string } = {}) {
  const router = createRouter().post('/sites/:siteId/versions/:versionId/candidate', handler)
  const app = createApp().use(eventHandler((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME: options.suffix ?? 'review.example.invalid' } }
  })).use(router)
  return toWebHandler(app)(new Request(`https://app.example/sites/${options.site ?? siteId}/versions/${options.version ?? versionId}/candidate${options.query ?? ''}`, {
    method: 'POST', body: options.body ?? '{"environment":"production"}', headers: {
      'origin': options.origin ?? 'https://app.example', 'host': 'app.example', 'x-forwarded-proto': 'https',
      'content-type': options.contentType ?? 'application/json', 'idempotency-key': options.key ?? 'candidate-request'
    }
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ ...user })
  mocks.tenant.mockResolvedValue(scope.tenantId)
  mocks.principal.mockResolvedValue(principal)
  mocks.query.mockResolvedValue({ rows: [{ delivery_mode: 'static' }] })
  mocks.authority.mockImplementation(async (_scope, _principal, work) => work({ query: mocks.query }))
  mocks.services.mockReturnValue({ environment: 'production', services })
  mocks.signing.mockReturnValue({ issuer: 'https://app.example', privateKey: 'configured-key' })
  mocks.build.mockImplementation(async (_input, _principal, _services, { runTransaction }) => runTransaction(async () => candidate.build))
  mocks.preview.mockImplementation(async (_input, _principal, { runTransaction }) => runTransaction(async () => candidate.preview))
  mocks.session.mockImplementation(async (_scope, _principal, { runTransaction }) => runTransaction(async () => candidate.session))
})
describe('Invited customer approved candidate HTTP boundary', () => {
  it('prepares an approved candidate using only the original authenticated customer and configured compiler', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual(candidate)
    expect(mocks.tenant).toHaveBeenCalledWith({ clientId: user.clientId, userId: user.id, siteId })
    expect(mocks.authority).toHaveBeenCalledWith(scope, principal, expect.any(Function))
    expect(mocks.build).toHaveBeenCalledWith({ scope, versionId, environment: 'production', idempotencyKey: 'candidate-request' }, principal, services, { recoverCandidate: true, runTransaction: expect.any(Function) })
    expect(mocks.preview).toHaveBeenCalledWith({ scope, versionId, environment: 'production', buildId: 'astro_candidate', previewHostname: 'review.example.invalid' }, principal, expect.anything())
    expect(mocks.session).toHaveBeenCalledWith(scope, principal, expect.anything())
    expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(mocks.services.mock.invocationCallOrder[0]!)
  })
  it.each([401, 403])('rejects authentication failure %i without resolving a site', async (statusCode) => {
    mocks.auth.mockRejectedValue(createError({ statusCode }))
    expect((await request()).status).toBe(statusCode)
    expect(mocks.tenant).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it.each(['https://evil.example', 'null', ''])('rejects foreign or missing Origin %s', async (origin) => {
    expect((await request({ origin })).status).toBe(403)
    expect(mocks.tenant).not.toHaveBeenCalled()
  })
  it.each([{ site: 'bad' }, { version: 'bad' }, { key: '' }, { query: '?tenantId=foreign' }])('rejects invalid path/header/query input', async (options) => {
    expect((await request(options)).status).toBe(400)
    expect(mocks.tenant).not.toHaveBeenCalled()
  })
  it.each([{ environment: 'staging' }, { environment: 'production', tenantId: 'foreign' },
    { environment: 'production', buildId: 'borrowed' }, { environment: 'production', previewHostname: 'evil.example' },
    { environment: 'production', manifest: {} }])('rejects untrusted build/ownership input', async (body) => {
    expect((await request({ body: JSON.stringify(body) })).status).toBe(400)
    expect(mocks.build).not.toHaveBeenCalled()
    expect(mocks.tenant).not.toHaveBeenCalled()
  })
  it('enforces actual JSON bytes and media type', async () => {
    expect((await request({ body: 'x'.repeat(2049) })).status).toBe(413)
    expect((await request({ body: '{bad' })).status).toBe(400)
    expect((await request({ contentType: 'text/plain' })).status).toBe(415)
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it('does not inspect compiler configuration or artifacts without current publishing access', async () => {
    mocks.authority.mockRejectedValue(createError({ statusCode: 403 }))
    expect((await request()).status).toBe(403)
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it('denies a site outside the authenticated customer scope', async () => {
    mocks.tenant.mockRejectedValue(createError({ statusCode: 404 }))
    expect((await request()).status).toBe(404)
    expect(mocks.principal).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it.each(['runtime', undefined])('rejects incompatible or unavailable delivery mode %s before compiler work', async (delivery_mode) => {
    mocks.query.mockResolvedValue({ rows: delivery_mode ? [{ delivery_mode }] : [] })
    expect((await request()).status).toBe(409)
    expect(mocks.services).not.toHaveBeenCalled()
  })
  it('rejects staging compiler configuration and missing preview suffix', async () => {
    mocks.services.mockReturnValue({ environment: 'staging', services })
    expect((await request()).status).toBe(409)
    expect((await request({ suffix: '' })).status).toBe(503)
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it('returns no session or preview when the compiler cannot complete', async () => {
    mocks.build.mockRejectedValue(createError({ statusCode: 503 }))
    expect((await request()).status).toBe(503)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it.each(['build', 'preview', 'session'] as const)('rejects a runtime switch during %s before returning a candidate', async (phase) => {
    const pending = mocks[phase]
    pending.mockImplementation(async (...args: unknown[]) => {
      mocks.query.mockResolvedValue({ rows: [{ delivery_mode: 'runtime' }] })
      const { runTransaction } = args.at(-1) as { runTransaction: (work: () => Promise<unknown>) => Promise<unknown> }
      return runTransaction(async () => candidate[phase])
    })
    const response = await request()
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('review-only-token')
    if (phase === 'build') expect(mocks.preview).not.toHaveBeenCalled()
    if (phase !== 'session') expect(mocks.session).not.toHaveBeenCalled()
  })
  it('returns no review credential if the final authority check fails', async () => {
    mocks.session.mockRejectedValue(createError({ statusCode: 403 }))
    const response = await request()
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('review-only-token')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each([2048, 2049])('preserves the observed request byte boundary at %i', async (bytes) => {
    const body = '{"environment":"production"}'.padEnd(bytes, ' ')
    const response = await request({ body })
    expect(response.status).toBe(bytes === 2048 ? 200 : 413)
    if (bytes > 2048) {
      expect(mocks.authority).not.toHaveBeenCalled()
      expect(mocks.services).not.toHaveBeenCalled()
      expect(mocks.build).not.toHaveBeenCalled()
    }
  })
  it('rejects malformed UTF-8 before publication authority or compiler configuration', async () => {
    const response = await request({ body: new Uint8Array([0x7b, 0x22, 0xc3, 0x22, 0x7d]) })
    expect(response.status).toBe(400)
    expect(mocks.authority).not.toHaveBeenCalled()
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it.each([196, 197])('preserves the configured preview hostname limit at %i', async (length) => {
    const suffix = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${length === 196 ? 'test' : 'tests'}`
    expect(suffix.length).toBe(length)
    const response = await request({ suffix })
    expect(response.status).toBe(length === 196 ? 200 : 503)
    expect(mocks.authority).toHaveBeenCalled()
    if (length > 196) {
      expect(mocks.services).not.toHaveBeenCalled()
      expect(mocks.signing).not.toHaveBeenCalled()
      expect(mocks.build).not.toHaveBeenCalled()
    }
  })
})
