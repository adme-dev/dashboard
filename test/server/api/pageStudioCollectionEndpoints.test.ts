import { createApp, createRouter, toWebHandler, createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioCollection } from '~~/server/utils/pageStudio/collectionsHttp'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), execute: vi.fn(), login: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({
  preparePageStudioContentLogin: mocks.login
}))
vi.mock('~~/server/utils/pageStudio/collections', () => ({ executePageStudioCollection: mocks.execute }))
function request(
  audience: 'agency' | 'portal',
  method: 'GET' | 'PUT',
  body?: string,
  type = 'application/json'
) {
  const router = createRouter()
  router.add(
    '/sites/:siteId/collections/:collectionId/records/:recordId',
    event => handlePageStudioCollection(event, audience, method === 'PUT' ? 'writeRecord' : 'readRecord'),
    [method.toLowerCase() as 'get' | 'put']
  )
  return toWebHandler(createApp().use(router))(
    new Request('https://fixture.test/sites/site_test/collections/fleet/records/car', {
      method,
      body,
      headers: body === undefined ? {} : { 'content-type': type }
    })
  )
}
describe('collection HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'tenant', user: { id: 'staff' } })
    mocks.portal.mockResolvedValue({ id: 'client_user', clientId: 'client' })
    mocks.login.mockImplementation((_event, actor) => ({ userId: actor.actorId, role: actor.role }))
    mocks.execute.mockResolvedValue({ items: [] })
  })
  it.each(['agency', 'portal'] as const)('uses original %s identity', async (audience) => {
    const response = await request(
      audience,
      'PUT',
      JSON.stringify({ values: { name: 'Car' }, scope: { tenantId: 'forged' } })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ actorId: audience === 'agency' ? 'staff' : 'client_user' }),
        login: expect.objectContaining({ userId: audience === 'agency' ? 'staff' : 'client_user' })
      }),
      'writeRecord',
      expect.objectContaining({ collectionId: 'fleet', recordId: 'car' })
    )
  })
  it('denies lost native authentication before RPC', async () => {
    mocks.login.mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request('portal', 'GET')).status).toBe(401)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('bounds observed JSON bodies before native write dispatch', async () => {
    expect((await request('portal', 'PUT', 'x'.repeat(512001))).status).toBe(413)
    expect((await request('portal', 'PUT', '{}', 'text/plain')).status).toBe(415)
    expect((await request('portal', 'PUT', '{broken')).status).toBe(400)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
