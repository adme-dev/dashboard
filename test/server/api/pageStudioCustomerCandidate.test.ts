import { createApp, createError, createRouter, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), authority: vi.fn(), services: vi.fn(), build: vi.fn(),
  preview: vi.fn(), session: vi.fn(), signing: vi.fn(), sign: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({}))
vi.mock('~~/server/utils/pageStudio/customerSignupEmail', () => ({}))
vi.mock('~~/server/utils/rateLimit', () => ({}))
vi.mock('~~/server/utils/portalSession', () => ({}))
vi.mock('~~/server/utils/pageStudio/customerPublishAuthority', () => ({ prepareCustomerPublishPrincipal: mocks.prepare }))
vi.mock('~~/server/utils/pageStudio/astroPublishAuthority', () => ({ withAstroPublishAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/astroBuildHttp', () => ({ resolveAstroBuildServices: mocks.services }))
vi.mock('~~/server/utils/pageStudio/astroBuildCoordinator', () => ({ coordinateApprovedAstroBuild: mocks.build }))
vi.mock('~~/server/utils/pageStudio/astroCandidatePreview', () => ({ registerAstroCandidatePreview: mocks.preview }))
vi.mock('~~/server/utils/pageStudio/customerPreviewSession', () => ({ issueCustomerPreviewSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/customerPreviewToken', async importOriginal => ({ ...await importOriginal<object>(), signCustomerPreviewToken: mocks.sign }))
vi.mock('~~/server/utils/pageStudio/sessions', async importOriginal => ({ ...await importOriginal<object>(), resolvePageStudioSessionEnvironment: mocks.signing }))
vi.stubGlobal('eventHandler', eventHandler)
vi.stubGlobal('createError', createError)

const siteId = '10000000-0000-4000-8000-000000000001', versionId = '10000000-0000-4000-8000-000000000002'
const scope = { tenantId: 'native-tenant', clientId: '10000000-0000-4000-8000-000000000003', siteId }
const principal = { kind: 'customer', identityId: '10000000-0000-4000-8000-000000000004',
  accountId: '10000000-0000-4000-8000-000000000005', workspaceId: '10000000-0000-4000-8000-000000000006', tokenHash: 'f'.repeat(64) }
const token = 'a'.repeat(64), services = { verifyBuild: vi.fn() }
const candidate = { build: { buildId: 'astro_native' }, preview: { hostname: 'build-one.review.example.invalid',
  release: { releaseId: '10000000-0000-4000-8000-000000000007' } }, session: { token: 'review-token', expiresAt: 123 } }
const { default: handler } = await import('~~/server/api/portal/page-studio/customer/sites/[siteId]/versions/[versionId]/candidate.post')
async function request(options: {
  method?: string
  body?: string | Uint8Array<ArrayBuffer>
  origin?: string
  cookie?: string
  key?: string
  query?: string
  site?: string
  version?: string
  contentType?: string
  enabled?: string
  suffix?: string
} = {}) {
  const router = createRouter().add('/sites/:siteId/versions/:versionId/candidate', handler, ['post', 'put'])
  const app = createApp().use(eventHandler((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: options.enabled ?? 'true',
      PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://app.example', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'test-v1',
      PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test', PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME: options.suffix ?? 'review.example.invalid' } }
  })).use(router)
  return toWebHandler(app)(new Request(`https://app.example/sites/${options.site ?? siteId}/versions/${options.version ?? versionId}/candidate${options.query ?? ''}`, {
    method: options.method ?? 'POST', body: options.body ?? '{"environment":"production"}', headers: {
      'host': 'app.example', 'x-forwarded-proto': 'https', 'origin': options.origin ?? 'https://app.example',
      'cookie': options.cookie ?? `__Host-studio_customer_session=${token}`,
      'content-type': options.contentType ?? 'application/json', 'idempotency-key': options.key ?? 'candidate-one'
    }
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.prepare.mockResolvedValue({ scope, principal })
  mocks.authority.mockImplementation(async (_scope, _principal, work) => work({}))
  mocks.services.mockReturnValue({ environment: 'production', services })
  mocks.signing.mockReturnValue({ privateKey: 'configured-private-key', issuer: 'https://app.example' })
  mocks.build.mockResolvedValue(candidate.build)
  mocks.preview.mockResolvedValue(candidate.preview)
  mocks.session.mockResolvedValue(candidate.session)
})
describe('Native customer candidate HTTP boundary', () => {
  it('builds a private candidate with original native authority and server-derived target', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual(candidate)
    expect(mocks.prepare).toHaveBeenCalledWith(token, siteId)
    expect(mocks.authority).toHaveBeenCalledWith(scope, principal, expect.any(Function))
    expect(mocks.authority.mock.invocationCallOrder[0]).toBeLessThan(mocks.services.mock.invocationCallOrder[0]!)
    expect(mocks.build).toHaveBeenCalledWith({ scope, versionId, environment: 'production', idempotencyKey: 'candidate-one' }, principal, services, { recoverCandidate: true })
    expect(mocks.preview).toHaveBeenCalledWith({ scope, versionId, buildId: candidate.build.buildId, environment: 'production', previewHostname: 'review.example.invalid' }, principal, expect.anything())
    expect(mocks.session).toHaveBeenCalledWith({ scope, hostname: candidate.preview.hostname, releaseId: candidate.preview.release.releaseId }, principal, { signToken: expect.any(Function) })
    await mocks.session.mock.calls[0]![2].signToken({ test: 'claims' })
    expect(mocks.sign).toHaveBeenCalledWith({ test: 'claims' }, 'configured-private-key', 'https://app.example')
  })
  it.each(['', 'portal_session=valid', `studio_customer_session=${token}`, '__Host-studio_customer_session=bad'])('requires native host-only cookie %s', async (cookie) => {
    expect((await request({ cookie })).status).toBe(401)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each(['https://other.example', 'null', ''])('rejects foreign or missing origin %s', async (origin) => {
    expect((await request({ origin })).status).toBe(403)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('requires configured native entry and POST', async () => {
    expect((await request({ enabled: 'false' })).status).toBe(404)
    expect((await request({ method: 'PUT' })).status).toBe(405)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each([{ site: 'bad' }, { version: 'bad' }, { query: '?tenant=other' }, { key: '' }])('rejects invalid paths, query and key', async (options) => {
    expect((await request(options)).status).toBe(400)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each([{ environment: 'staging' }, { environment: 'production', scope }, { environment: 'production', actorRole: 'agency' },
    { environment: 'production', hostname: 'other.example' }, { environment: 'production', buildId: 'borrowed' },
    { environment: 'production', releaseId: candidate.preview.release.releaseId }, { environment: 'production', manifest: {} }])('rejects caller-supplied authority and artifacts', async (body) => {
    expect((await request({ body: JSON.stringify(body) })).status).toBe(400)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('bounds observed JSON and rejects malformed input', async () => {
    expect((await request({ body: 'x'.repeat(2049) })).status).toBe(413)
    expect((await request({ body: '{broken' })).status).toBe(400)
    expect((await request({ contentType: 'text/plain' })).status).toBe(415)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it.each(['prepare', 'authority'] as const)('rejects access at %s before resolving compiler services', async (phase) => {
    mocks[phase].mockRejectedValue(createError({ statusCode: 403 }))
    expect((await request()).status).toBe(403)
    expect(mocks.services).not.toHaveBeenCalled()
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('refuses missing preview suffix or staging compiler before building', async () => {
    expect((await request({ suffix: '' })).status).toBe(503)
    mocks.services.mockReturnValue({ environment: 'staging', services })
    expect((await request()).status).toBe(409)
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it('refuses missing signing configuration before building', async () => {
    mocks.signing.mockImplementation(() => {
      throw createError({ statusCode: 503 })
    })
    expect((await request()).status).toBe(503)
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it.each(['build', 'preview', 'session'] as const)('returns no credential when %s fails', async (phase) => {
    const { PageStudioPublishingError } = await import('~~/server/utils/pageStudio/publishingError')
    mocks[phase].mockRejectedValue(new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current publishing access is required'))
    const response = await request()
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.text()
    expect(body).not.toContain(principal.tokenHash)
    expect(body).not.toContain(candidate.session.token)
    if (phase !== 'session') expect(mocks.session).not.toHaveBeenCalled()
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
