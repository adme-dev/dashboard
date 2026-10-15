import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn(), available: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerLaunchContext', () => ({ readCustomerLaunchContext: mocks.context }))
vi.mock('~~/server/utils/pageStudio/inspectionClient', () => ({ readCustomerPageStudioLaunchState: mocks.read }))
vi.mock('~~/server/utils/pageStudio/candidateAvailability', () => ({ productionCandidateAvailable: mocks.available }))
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const actor = { actorId: 'native-identity', accountId: 'native-account', workspaceId: 'native-workspace', siteId }
const scope = { tenantId: 'native-tenant', clientId: 'native-business', workspaceId: actor.workspaceId, canManagePublication: true }
const env = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test',
  PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
async function request(path = siteId, query = '', cookie = `__Host-studio_customer_session=${'a'.repeat(64)}`) {
  const { default: handler } = await import('~~/server/api/portal/page-studio/customer/sites/[siteId]/launch-state.get')
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  })
    .use(createRouter().get('/sites/:siteId/launch-state', handler))
  return toWebHandler(app)(new Request(`https://studio.example.test/sites/${path}/launch-state${query}`, { headers: { cookie } }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('eventHandler', eventHandler)
  mocks.context.mockResolvedValue({ actor, scope })
  mocks.read.mockResolvedValue({ siteId, deliveryMode: 'static', canManagePublication: true, content: { requiresSealedFeatures: false } })
  mocks.available.mockResolvedValue(true)
})
afterEach(() => vi.unstubAllGlobals())
it('reads under original native login before and after asynchronous inspection', async () => {
  const response = await request()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ siteId, candidateReview: true })
  expect(mocks.context).toHaveBeenCalledTimes(2)
  expect(mocks.context).toHaveBeenNthCalledWith(2, 'a'.repeat(64), siteId)
  expect(mocks.read).toHaveBeenCalledWith({ ...actor, env })
})
it.each(['', 'client_session_token=portal', 'session_token=staff'])('rejects absent or non-native cookie: %s', async (cookie) => {
  expect((await request(siteId, '', cookie)).status).toBe(401)
  expect(mocks.context).not.toHaveBeenCalled()
})
it.each([['bad', ''], [siteId, '?tenantId=foreign'], [siteId, '?workspaceId=foreign']])('rejects malformed or caller-selected scope', async (id, query) => {
  expect((await request(id, query)).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
})
it('withholds the result after logout during remote inspection', async () => {
  mocks.context.mockResolvedValueOnce({ actor, scope }).mockRejectedValueOnce(createError({ statusCode: 401 }))
  expect((await request()).status).toBe(401)
})
it('withholds a changed workspace or owner result', async () => {
  mocks.context.mockResolvedValueOnce({ actor, scope }).mockResolvedValueOnce({ actor, scope: { ...scope, clientId: 'foreign' } })
  expect((await request()).status).toBe(403)
})
it('withholds preparation after plan permission is withdrawn during compiler checks', async () => {
  mocks.context.mockResolvedValueOnce({ actor, scope }).mockResolvedValueOnce({ actor, scope: { ...scope, canManagePublication: false } })
  expect(await (await request()).json()).toMatchObject({ canManagePublication: false, candidateReview: false })
})
it.each([
  { canManagePublication: false, deliveryMode: 'static', content: { requiresSealedFeatures: false } },
  { canManagePublication: true, deliveryMode: 'runtime', content: { requiresSealedFeatures: false } },
  { canManagePublication: true, deliveryMode: 'static', content: { requiresSealedFeatures: true } }
])('withholds unsupported preview preparation', async (flags) => {
  mocks.read.mockResolvedValue({ siteId, ...flags })
  expect(await (await request()).json()).toMatchObject({ candidateReview: false })
  expect(mocks.available).not.toHaveBeenCalled()
})
it('keeps unavailable status separate from unpublished status', async () => {
  mocks.read.mockRejectedValue(createError({ statusCode: 503 }))
  expect((await request()).status).toBe(503)
})
