import { createApp, createRouter, toWebHandler, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), operator: vi.fn(), login: vi.fn(), bind: vi.fn(), session: vi.fn(), call: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}), transaction: async work => work({}) }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ requireCustomerPlanOperator: mocks.operator }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login, bindPageStudioLoginSession: mocks.bind }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/transferRecoveryReviewControlClient', () => ({ callTransferRecoveryReviewControl: mocks.call }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const siteId = id(1), requestId = id(2), actorId = id(3), token = 'c'.repeat(64)
const review = { reviewId: id(4), revision: 1, reviewDigest: 'b'.repeat(64) }
const body = { expectedRevision: 5, request: { action: 'consent-review', review, consentId: id(5) } }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
async function request(owner: boolean, value: unknown = body, options: { cookie?: string, origin?: string, query?: string, method?: string, contentType?: string } = {}) {
  const loaded = owner ? await import('../../../server/api/portal/page-studio/customer/sites/[siteId]/transfer-requests/[requestId]/recovery/review.post') : await import('../../../server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/review.post')
  const app = createApp().use(event => { event.context.cloudflare = { env } }).use(createRouter().use('/sites/:siteId/requests/:requestId/review', loaded.default))
  const method = options.method ?? 'POST'
  return toWebHandler(app)(new Request(`https://studio.example.test/sites/${siteId}/requests/${requestId}/review${options.query ?? ''}`, { method,
    headers: { host: 'studio.example.test', 'x-forwarded-proto': 'https', origin: options.origin ?? 'https://studio.example.test', cookie: options.cookie ?? (owner ? `__Host-studio_customer_session=${token}` : 'auth_token=real-cookie'), 'content-type': options.contentType ?? 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(value) }) }))
}
beforeEach(() => {
  env.PAGE_STUDIO_CUSTOMER_ORIGIN = 'https://studio.example.test'; vi.resetAllMocks(); vi.stubGlobal('eventHandler', eventHandler)
  mocks.auth.mockResolvedValue({ id: actorId }); mocks.login.mockResolvedValue({ userId: actorId, tokenHash: 'a'.repeat(64), role: 'agency' })
  mocks.session.mockResolvedValue({ identityId: id(6), accountId: id(7) }); mocks.limit.mockResolvedValue({ allowed: true })
  mocks.call.mockResolvedValue({ ok: true })
})
afterEach(() => vi.unstubAllGlobals())
it.each([false, true])('uses genuine identity before and after one explicit operation (owner=%s)', async owner => {
  const result = await request(owner)
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, ...body, authentication: owner ? { ownerToken: token } : { operator: { actorId, loginSessionHash: 'a'.repeat(64) } } }, env)
  expect(owner ? mocks.session : mocks.operator).toHaveBeenCalledTimes(2)
})
it.each([false, true])('blocks foreign origins/cookies/queries/methods/body bounds (owner=%s)', async owner => {
  for (const [options, status] of [[{ origin: 'https://foreign.test' }, 403], [{ cookie: '' }, 401], [{ method: 'GET' }, 405], [{ query: '?force=1' }, 400], [{ contentType: 'text/plain' }, 415]] as const) expect((await request(owner, body, options)).status).toBe(status)
  expect((await request(owner, { ...body, padding: 'x'.repeat(4097) })).status).toBe(413)
  expect(mocks.call).not.toHaveBeenCalled()
})
it.each([false, true])('rejects injected authority and ambiguous review selection (owner=%s)', async owner => {
  for (const value of [{ ...body, operator: { actorId } }, { ...body, ownerToken: token }, { ...body, expectedRevision: 0 }, { ...body, request: { ...body.request, party: 'operator' } }, { ...body, request: { action: 'read-latest' } }, { ...body, request: { action: 'read', review: { ...review, extra: true } } }]) expect((await request(owner, value)).status).toBe(400)
  expect(mocks.call).not.toHaveBeenCalled()
})
it.each(['renew-plan', 'create-review', 'approve-review'])('does not permit native owner action %s', async action => {
  expect((await request(true, { ...body, request: { ...body.request, action } })).status).toBe(400)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('withholds acknowledgement after native account change or operator role loss', async () => {
  mocks.session.mockResolvedValueOnce({ identityId: id(6) }).mockResolvedValueOnce({ identityId: id(99) })
  expect((await request(true)).status).toBe(403)
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  expect((await request(false)).status).toBe(403)
  expect(mocks.call).toHaveBeenCalledTimes(2)
})
it.each([false, true])('closes on rate-limit failure and never retries lost acknowledgement (owner=%s)', async owner => {
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 1000) })
  expect((await request(owner)).status).toBe(429); expect(mocks.call).not.toHaveBeenCalled()
  mocks.call.mockRejectedValueOnce(Error('private owner token detail'))
  const response = await request(owner)
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private owner token')
  expect(mocks.call).toHaveBeenCalledOnce()
})

it('returns only the validated configured owner origin to the operator', async () => {
  expect(await (await request(false)).json()).toEqual({ view: { ok: true }, customerOrigin: 'https://studio.example.test' })
  env.PAGE_STUDIO_CUSTOMER_ORIGIN = 'https://studio.example.test/unsafe-path'
  expect(await (await request(false)).json()).toEqual({ view: { ok: true }, customerOrigin: null })
  expect((await request(true)).status).toBe(503)
  env.PAGE_STUDIO_CUSTOMER_ORIGIN = 'https://studio.example.test'
  expect(await (await request(true)).json()).toEqual({ ok: true })
})
