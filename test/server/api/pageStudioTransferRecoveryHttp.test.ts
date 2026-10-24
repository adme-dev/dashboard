import { randomUUID } from 'node:crypto'
import { createApp, createRouter, toWebHandler, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), operator: vi.fn(), login: vi.fn(), bind: vi.fn(), call: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}), transaction: async work => work({}) }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ requireCustomerPlanOperator: mocks.operator }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login, bindPageStudioLoginSession: mocks.bind }))
vi.mock('~~/server/utils/pageStudio/transferRecoveryClient', () => ({ callTransferRecovery: mocks.call }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const siteId = randomUUID(), requestId = randomUUID(), actorId = randomUUID(), recoveryId = randomUUID()
const body = { action: 'open', expectedRevision: 5, recoveryId, expectedHeadVersion: null, deadline: '2026-10-24T00:00:00.000Z' }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
async function request(input: unknown = body, options: { read?: boolean, method?: string, query?: string, cookie?: string, origin?: string, contentType?: string } = {}) {
  const loaded = options.read
    ? await import('../../../server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery.get')
    : await import('../../../server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery.post')
  const app = createApp().use(event => { event.context.cloudflare = { env } })
    .use(createRouter().use('/sites/:siteId/requests/:requestId/recovery', loaded.default))
  const method = options.method ?? (options.read ? 'GET' : 'POST')
  return toWebHandler(app)(new Request(`https://app.xeroflow.io/sites/${siteId}/requests/${requestId}/recovery${options.query ?? (options.read ? '?expectedRevision=5' : '')}`, {
    method, headers: { host: 'app.xeroflow.io', 'x-forwarded-proto': 'https', origin: options.origin ?? 'https://app.xeroflow.io',
      cookie: options.cookie ?? 'auth_token=ordinary-login', 'content-type': options.contentType ?? 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(input) })
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('eventHandler', eventHandler)
  mocks.auth.mockResolvedValue({ id: actorId })
  mocks.login.mockResolvedValue({ tokenHash: 'a'.repeat(64), role: 'agency', userId: actorId })
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.call.mockResolvedValue({ siteId, requestId, revision: 5, recovery: null, allowedActions: [] })
})
afterEach(() => vi.unstubAllGlobals())

it.each([false, true])('derives genuine operator authority and checks it after the one call (read=%s)', async read => {
  const response = await request(undefined, { read })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, operator: { actorId, loginSessionHash: 'a'.repeat(64) },
    ...(read ? { action: 'status', expectedRevision: 5 } : body) }, env)
  expect(mocks.auth).toHaveBeenCalledTimes(2)
  expect(mocks.operator).toHaveBeenCalledTimes(2)
})
it.each([
  [{ cookie: '' }, 401], [{ origin: 'https://foreign.invalid' }, 403], [{ method: 'GET' }, 405],
  [{ read: true, query: '?expectedRevision=5&operationId=foreign' }, 400],
  [{ read: true, query: '' }, 400], [{ query: '?force=true' }, 400], [{ contentType: 'text/plain' }, 415]
] as const)('rejects request boundary before dispatch: %j', async (options, status) => {
  expect((await request(undefined, options)).status).toBe(status)
  expect(mocks.call).not.toHaveBeenCalled()
})
it.each([{ ...body, operator: { actorId } }, { ...body, action: 'resume' }, { ...body, intentDigest: 'a'.repeat(64) }])(
  'rejects browser private authority and execution requests', async input => {
  expect((await request(input)).status).toBe(400)
  expect(mocks.call).not.toHaveBeenCalled()
})
it('rejects role loss before or after the action and never repeats an uncertain request', async () => {
  mocks.operator.mockRejectedValueOnce({ statusCode: 403 })
  expect((await request()).status).toBe(403)
  expect(mocks.call).not.toHaveBeenCalled()
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  expect((await request()).status).toBe(403)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  mocks.call.mockRejectedValueOnce(new Error('private database credentials'))
  const response = await request()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('credentials')
  expect(mocks.call).toHaveBeenCalledTimes(2)
})
it('bounds the body and fails closed when rate limiting is unavailable', async () => {
  expect((await request({ ...body, padding: 'x'.repeat(1025) })).status).toBe(413)
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 1000) })
  expect((await request()).status).toBe(429)
  expect(mocks.call).not.toHaveBeenCalled()
})
