import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ recover: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerManagedTransfer', () => ({ recoverCustomerManagedTransfer: mocks.recover }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const env = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test',
  PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
async function request(body: unknown = { action: 'retry-connection' }, options: { path?: string, query?: string, cookie?: string, origin?: string, method?: string, contentType?: string } = {}) {
  const { default: handler } = await import('~~/server/api/portal/page-studio/customer/sites/[siteId]/transfer-recovery.post')
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  })
    .use(createRouter().use('/sites/:siteId/transfer-recovery', handler))
  const method = options.method ?? 'POST'
  return toWebHandler(app)(new Request(`https://studio.example.test/sites/${options.path ?? siteId}/transfer-recovery${options.query ?? ''}`, {
    method, headers: { 'cookie': options.cookie ?? `__Host-studio_customer_session=${'a'.repeat(64)}`, 'origin': options.origin ?? 'https://studio.example.test', 'content-type': options.contentType ?? 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('eventHandler', eventHandler)
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.recover.mockResolvedValue({ siteId, completed: true, stage: 'completed', editorConnection: 'ready', sourceRetention: 'pending', canRetryConnection: false, canRetryRetention: true })
})
afterEach(() => vi.unstubAllGlobals())
it.each(['retry-connection', 'retry-retention'])('dispatches explicit %s with current native cookie and no-store', async (action) => {
  const response = await request({ action })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith('a'.repeat(64), siteId, { action }, { env })
})
it.each([
  [{ action: 'retry-connection', operationId: siteId }, {}],
  [{ action: 'retry-connection', proof: {} }, {}],
  [{ action: 'publish' }, {}],
  [{ action: 'retry-connection' }, { query: '?scope=foreign' }],
  [{ action: 'retry-connection' }, { path: 'bad' }]
])('rejects browser-selected private fields or malformed identity', async (body, options) => {
  expect((await request(body, options)).status).toBe(400)
  expect(mocks.recover).not.toHaveBeenCalled()
})
it.each([
  [{ cookie: 'client_session_token=portal' }, 401],
  [{ cookie: '' }, 401],
  [{ origin: 'https://foreign.test' }, 403],
  [{ method: 'GET' }, 405],
  [{ contentType: 'text/plain' }, 415]
] as const)('rejects incorrect request boundary', async (options, status) => {
  const response = await request(undefined, options)
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.recover).not.toHaveBeenCalled()
})
it('limits requests before dispatch and bounds body bytes', async () => {
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
  expect((await request()).status).toBe(429)
  expect((await request({ action: 'retry-connection', padding: 'x'.repeat(2048) })).status).toBe(413)
  expect(mocks.recover).not.toHaveBeenCalled()
})
it.each([403, 409, 503])('redacts failed or uncertain action %s without repeating it', async (statusCode) => {
  mocks.recover.mockRejectedValue(createError({ statusCode, statusMessage: 'private provider key and proof' }))
  const response = await request()
  expect(response.status).toBe(statusCode)
  expect(await response.text()).not.toContain('private provider')
  expect(mocks.recover).toHaveBeenCalledTimes(1)
})
