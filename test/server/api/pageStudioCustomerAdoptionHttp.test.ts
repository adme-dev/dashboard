import { createApp, createRouter, toWebHandler, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ options: vi.fn(), session: vi.fn(), read: vi.fn(), mutate: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerCmsSetupHttp', () => ({ customerCmsSetupOptions: mocks.options }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/customerAdoptionSetup', () => ({ readCustomerAdoptionSetup: mocks.read, mutateCustomerAdoptionSetup: mocks.mutate }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}) }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const grantId = '20000000-0000-4000-8000-000000000003'
const reference = { grantId, revision: 1 }
const token = 'c'.repeat(64)
const env = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
const options = { configuration: {}, env }
async function request(method: 'GET' | 'POST', body?: unknown, settings: { query?: string, cookie?: string, origin?: string, type?: string, actualMethod?: string, grantId?: string } = {}) {
  const handlers = import.meta.glob('../../../server/api/portal/page-studio/customer/cms-adoption/*.ts')
  const handler = await handlers[`../../../server/api/portal/page-studio/customer/cms-adoption/[grantId].${method.toLowerCase()}.ts`]() as { default: Parameters<ReturnType<typeof createRouter>['use']>[1] }
  const app = createApp().use(event => { event.context.cloudflare = { env } }).use(createRouter().use('/adoption/:grantId', handler.default))
  const actualMethod = settings.actualMethod ?? method
  return toWebHandler(app)(new Request(`https://studio.example.test/adoption/${settings.grantId ?? grantId}${settings.query ?? (method === 'GET' ? '?revision=1' : '')}`, {
    method: actualMethod,
    headers: { host: 'studio.example.test', 'x-forwarded-proto': 'https', cookie: settings.cookie ?? `__Host-studio_customer_session=${token}`, origin: settings.origin ?? 'https://studio.example.test', 'content-type': settings.type ?? 'application/json' },
    ...(actualMethod === 'GET' ? {} : { body: JSON.stringify(body) })
  }))
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('defineEventHandler', eventHandler)
  mocks.options.mockReturnValue(options)
  mocks.session.mockResolvedValue({ identityId: 'owner', accountId: 'account' })
  mocks.read.mockResolvedValue({ resumeRequired: true, adoption: null })
  mocks.mutate.mockResolvedValue({ resumed: true })
  mocks.limit.mockResolvedValue({ allowed: true })
})
afterEach(() => vi.unstubAllGlobals())
it('GET reads only the explicit reference, validates owner twice, and never creates a child', async () => {
  const response = await request('GET')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(await response.json()).toEqual({ grant: reference, result: { resumeRequired: true, adoption: null } })
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(token, reference, options)
  expect(mocks.mutate).not.toHaveBeenCalled()
  expect(mocks.session).toHaveBeenCalledTimes(2)
})
it('explicit resume uses native cookie, exact reference and one mutation', async () => {
  const body = { operation: 'resume', grant: reference }
  const response = await request('POST', body)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ grant: reference, result: { resumed: true } })
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(token, body, options)
  expect(mocks.session).toHaveBeenCalledTimes(2)
})
it.each(['', '?revision=0', '?revision=-1', '?revision=1.2', '?revision=2147483647', '?revision=1&revision=2', '?revision=1&latest=true'])('denies unsupported or ambiguous GET query %s', async query => {
  expect((await request('GET', undefined, { query })).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
})
it.each([
  { operation: 'resume', grant: { ...reference, grantId: '20000000-0000-4000-8000-000000000099' } },
  { operation: 'resume', grant: reference, token },
  { operation: 'prepare', grant: reference },
  { operation: 'resume', grant: { ...reference, revision: 0 } },
  { operation: 'resume', grant: { ...reference, siteId: grantId } }
])('rejects cross-route grant or extra authority', async body => {
  expect((await request('POST', body)).status).toBe(400)
  expect(mocks.mutate).not.toHaveBeenCalled()
})
it('rejects origin, cookie, content type, oversized input, method and configuration', async () => {
  expect((await request('POST', {}, { origin: 'https://foreign.test' })).status).toBe(403)
  expect((await request('POST', {}, { cookie: '' })).status).toBe(401)
  expect((await request('POST', {}, { type: 'text/plain' })).status).toBe(415)
  expect((await request('POST', { padding: 'x'.repeat(4097) })).status).toBe(413)
  expect((await request('GET', {}, { actualMethod: 'POST' })).status).toBe(405)
  mocks.options.mockReturnValue(null)
  expect((await request('POST', { operation: 'resume', grant: reference })).status).toBe(403)
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled()
})
it('enforces rate limit before mutation', async () => {
  mocks.limit.mockResolvedValue({ allowed: false, resetAt: new Date(Date.now() + 60_000) })
  expect((await request('POST', { operation: 'resume', grant: reference })).status).toBe(429)
  expect(mocks.mutate).not.toHaveBeenCalled()
})
it('withholds result after owner change and denies revoked login before dispatch', async () => {
  mocks.session.mockResolvedValueOnce({ identityId: 'owner' }).mockResolvedValueOnce({ identityId: 'other' })
  expect((await request('GET')).status).toBe(403)
  mocks.session.mockRejectedValue({ statusCode: 401 })
  expect((await request('POST', { operation: 'resume', grant: reference })).status).toBe(401)
  expect(mocks.mutate).not.toHaveBeenCalled()
})
it('redacts credentials, rejects leaked projections and never retries a lost acknowledgement', async () => {
  mocks.read.mockResolvedValue({ resumeRequired: true, adoption: null, credential: 'private' })
  expect((await request('GET')).status).toBe(503)
  mocks.mutate.mockRejectedValue(Error('private credentials'))
  const response = await request('POST', { operation: 'resume', grant: reference })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private credentials')
  expect(mocks.mutate).toHaveBeenCalledOnce()
})
