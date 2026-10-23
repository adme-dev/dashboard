import { createApp, createRouter, toWebHandler, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), operator: vi.fn(), login: vi.fn(), bind: vi.fn(), call: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}), transaction: async work => work({}) }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ requireCustomerPlanOperator: mocks.operator }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login, bindPageStudioLoginSession: mocks.bind }))
vi.mock('~~/server/utils/pageStudio/transferRecoveryAdmissionControlClient', () => ({ callTransferRecoveryAdmissionControl: mocks.call }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const siteId = id(1), requestId = id(2), actorId = id(3)
const review = { reviewId: id(4), revision: 1, reviewDigest: 'b'.repeat(64) }
const actions = [{ action: 'read' }, { action: 'begin', admissionId: id(5), review, expectedHeadVersion: 2, prepareEventId: id(6), enableEventId: id(7) }, { action: 'prepare', admissionId: id(5), expectedHeadVersion: 3 }, { action: 'apply', admissionId: id(5), expectedHeadVersion: 3 }, { action: 'enable', admissionId: id(5), expectedHeadVersion: 4 }]
const body = { expectedRevision: 5, request: actions[0] }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
async function request(value: unknown = body, options: { cookie?: string, origin?: string, query?: string, method?: string, contentType?: string } = {}) {
  const loaded = await import('../../../server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/admission.post')
  const app = createApp().use(event => { event.context.cloudflare = { env } }).use(createRouter().use('/sites/:siteId/requests/:requestId/admission', loaded.default))
  const method = options.method ?? 'POST'
  return toWebHandler(app)(new Request(`https://studio.example.test/sites/${siteId}/requests/${requestId}/admission${options.query ?? ''}`, { method,
    headers: { host: 'studio.example.test', 'x-forwarded-proto': 'https', origin: options.origin ?? 'https://studio.example.test', cookie: options.cookie ?? 'auth_token=real-cookie', 'content-type': options.contentType ?? 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(value) }) }))
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('eventHandler', eventHandler)
  mocks.auth.mockResolvedValue({ id: actorId }); mocks.login.mockResolvedValue({ userId: actorId, tokenHash: 'a'.repeat(64), role: 'agency' })
  mocks.limit.mockResolvedValue({ allowed: true }); mocks.call.mockResolvedValue({ pgState: 'approved', d1State: 'unverified' })
})
afterEach(() => vi.unstubAllGlobals())
it.each(actions)('checks genuine operator before and after a single $action', async action => {
  const result = await request({ ...body, request: action })
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, expectedRevision: 5, request: action, operator: { actorId, loginSessionHash: 'a'.repeat(64) } }, env)
  expect(mocks.operator).toHaveBeenCalledTimes(2)
})
it('rejects foreign origin, absent or native-only cookie, queries, methods and body bounds', async () => {
  for (const [options, status] of [[{ origin: 'https://foreign.test' }, 403], [{ cookie: '' }, 401], [{ cookie: '__Host-studio_customer_session=native-only' }, 401], [{ method: 'GET' }, 405], [{ query: '?force=1' }, 400], [{ contentType: 'text/plain' }, 415]] as const) expect((await request(body, options)).status).toBe(status)
  expect((await request({ ...body, padding: 'x'.repeat(4097) })).status).toBe(413)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('rejects injected authority, hidden phases and invalid transitions', async () => {
  for (const value of [{ ...body, operator: { actorId } }, { ...body, ownerToken: 'secret' }, { ...body, expectedRevision: 0 }, { ...body, request: { action: 'read', grant: {} } }, { ...body, request: { action: 'source-execution' } }, { ...body, request: { ...actions[2], expectedHeadVersion: 4 } }, { ...body, request: { ...actions[1], enableEventId: id(6) } }]) expect((await request(value)).status).toBe(400)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('withholds acknowledgement after operator role or session changes', async () => {
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  expect((await request()).status).toBe(403)
  mocks.login.mockResolvedValueOnce({ userId: actorId, tokenHash: 'a'.repeat(64) }).mockResolvedValueOnce({ userId: actorId, tokenHash: 'b'.repeat(64) })
  expect((await request()).status).toBe(403)
  expect(mocks.call).toHaveBeenCalledTimes(2)
})
it('fails closed on rate limit and preserves a lost acknowledgement without retry', async () => {
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 1000) })
  expect((await request()).status).toBe(429); expect(mocks.call).not.toHaveBeenCalled()
  mocks.call.mockRejectedValueOnce(Error('private admission data'))
  const response = await request({ ...body, request: actions[1] })
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private admission data')
  expect(mocks.call).toHaveBeenCalledOnce()
})
