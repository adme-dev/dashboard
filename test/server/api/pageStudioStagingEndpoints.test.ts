import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioStaging } from '~~/server/utils/pageStudio/stagingHttp'
import { pageStudioStagingAddress } from '~~/shared/pageStudio/staging'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), service: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const actorId = '30000000-0000-4000-8000-000000000001'
const clientId = '40000000-0000-4000-8000-000000000001'
const update = { digest: 'a'.repeat(64), expectedActiveId: null, idempotencyKey: '50000000-0000-4000-8000-000000000001' }
const value = () => ({ siteId, ...pageStudioStagingAddress(siteId), status: 'not_published', canManage: true, active: null, currentDigest: update.digest, failure: null })
function request(audience: 'agency' | 'portal', method: 'GET' | 'POST', body?: string, contentType = 'application/json', ensure = false) {
  const router = createRouter()
  router.add('/sites/:siteId/staging', event => handlePageStudioStaging(event, audience, ensure ? 'ensure' : method === 'POST' ? 'update' : 'read'), [method.toLowerCase() as 'get' | 'post'])
  const app = createApp().use(eventHandler((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { clientStaging: mocks.service } } } as never
  })).use(router)
  return toWebHandler(app)(new Request(`https://app.test/sites/${siteId}/staging`, { method, body, headers: body === undefined ? {} : { 'content-type': contentType } }))
}
describe('client staging HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'tenant_test', user: { id: actorId } })
    mocks.portal.mockResolvedValue({ id: actorId, clientId })
    mocks.service.mockImplementation(async input => ({ ok: true, operation: input.operation, siteId: input.siteId, environment: input.expectedEnvironment,
      actorKind: input.actor.kind, scopeId: input.actor.kind === 'agency' ? input.actor.tenantId : input.actor.clientId, value: value() }))
  })
  it.each(['agency', 'portal'] as const)('authenticates %s and sends only the trusted actor and exact snapshot request', async (audience) => {
    expect((await request(audience, 'GET')).status).toBe(200)
    const response = await request(audience, 'POST', JSON.stringify(update))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.service.mock.calls[1][0]).toEqual({ operation: 'update', expectedEnvironment: 'production', siteId, body: update,
      actor: audience === 'agency' ? { kind: 'agency', tenantId: 'tenant_test', actorId } : { kind: 'portal', clientId, actorId } })
  })
  it.each(['agency', 'portal'] as const)('admits initial %s staging using only authenticated scope and an empty body', async (audience) => {
    const response = await request(audience, 'POST', '{}', 'application/json', true)
    expect(response.status).toBe(200)
    expect(mocks.service).toHaveBeenCalledWith({ operation: 'ensure', expectedEnvironment: 'production', siteId,
      actor: audience === 'agency' ? { kind: 'agency', tenantId: 'tenant_test', actorId } : { kind: 'portal', clientId, actorId } })
  })
  it('rejects caller-selected initial content, identity or destination before invoking the service', async () => {
    for (const body of [update, { siteId }, { clientId }, { actorId }, { hostname: 'other.example' }, { operation: 'update' }, { digest: update.digest }]) {
      expect((await request('portal', 'POST', JSON.stringify(body), 'application/json', true)).status).toBe(400)
    }
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it('keeps initial staging behind native authentication and fresh service permission checks', async () => {
    mocks.portal.mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request('portal', 'POST', '{}', 'application/json', true)).status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
    mocks.service.mockResolvedValue({ ok: false, error: { code: 'STAGING_ACCESS_DENIED', statusCode: 403 } })
    expect((await request('portal', 'POST', '{}', 'application/json', true)).status).toBe(403)
  })
  it.each(['agency', 'portal'] as const)('denies %s requests before invoking the Worker when native authentication fails', async (audience) => {
    mocks[audience].mockRejectedValue(createError({ statusCode: 401 }))
    expect((await request(audience, 'POST', JSON.stringify(update))).status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it('rejects host, client and actor injection as well as malformed or oversized bodies', async () => {
    for (const body of [{ ...update, hostname: 'app.xeroflow.io' }, { ...update, clientId }, { ...update, actorId }]) {
      expect((await request('portal', 'POST', JSON.stringify(body))).status).toBe(400)
    }
    expect((await request('portal', 'POST', '{invalid')).status).toBe(400)
    expect((await request('portal', 'POST', 'x'.repeat(2049))).status).toBe(413)
    expect((await request('portal', 'POST', '{}', 'text/plain')).status).toBe(415)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it.each(['scopeId', 'environment', 'actorKind', 'siteId'])('does not accept a service response with another %s', async (key) => {
    mocks.service.mockResolvedValue({ ok: true, operation: 'read', siteId, environment: 'production', actorKind: 'portal', scopeId: clientId, value: value(), [key]: 'foreign' })
    expect((await request('portal', 'GET')).status).toBe(503)
  })
  it('returns a clear package allowance error without provider details', async () => {
    mocks.service.mockResolvedValue({ ok: false, error: { code: 'STAGING_BUILD_LIMIT', statusCode: 429, message: 'private diagnostic' } })
    const response = await request('portal', 'POST', JSON.stringify(update))
    expect(response.status).toBe(429)
    const body = await response.text()
    expect(body).toContain('monthly website build allowance')
    expect(body).not.toContain('private diagnostic')
  })
  it('does not expose service exception details', async () => {
    mocks.service.mockRejectedValue(new Error('private provider payload'))
    const response = await request('portal', 'GET')
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private provider payload')
  })
})
