import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/inspectionClient', () => ({ readPortalPageStudioLaunchState: mocks.read }))
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }
async function request(path = siteId, query = '') {
  const { default: handler } = await import('~~/server/api/portal/page-studio/sites/[siteId]/launch-state.get')
  const router = createRouter().get('/sites/:siteId/launch-state', handler)
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  }).use(router)
  return toWebHandler(app)(new Request(`https://example.test/sites/${path}/launch-state${query}`))
}
describe('customer launch state HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('eventHandler', eventHandler)
    mocks.auth.mockResolvedValue({ id: 'signed_in_user', clientId: 'signed_in_client' })
    mocks.read.mockResolvedValue({ siteId })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('uses only authenticated customer scope and disables response caching', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.read).toHaveBeenCalledWith({ actorId: 'signed_in_user', clientId: 'signed_in_client', siteId, env })
  })
  it.each([401, 403])('stops before inspection when access is denied (%s)', async (statusCode) => {
    mocks.auth.mockRejectedValue(createError({ statusCode }))
    expect((await request()).status).toBe(statusCode)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it.each([['invalid', ''], [siteId, '?tenantId=forged'], [siteId, '?clientId=foreign']])('rejects malformed identity and client-selected scope', async (id, query) => {
    expect((await request(id, query)).status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('keeps an unavailable inspection distinct from an unpublished site', async () => {
    mocks.read.mockRejectedValue(createError({ statusCode: 503 }))
    const response = await request()
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
