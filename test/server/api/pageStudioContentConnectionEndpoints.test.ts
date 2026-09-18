import { createApp, createRouter, toWebHandler, createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioContentConnection } from '~~/server/utils/pageStudio/contentConnectionHttp'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/contentConnection', () => ({
  getPageStudioContentConnection: mocks.read, connectPageStudioContent: mocks.write
}))

const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
function request(audience: 'agency' | 'portal', method: 'GET' | 'POST', body?: string, contentType = 'application/json') {
  const router = createRouter()
  router.add('/sites/:siteId/content', event => handlePageStudioContentConnection(event, audience, method), [method.toLowerCase() as 'get' | 'post'])
  const fetch = toWebHandler(createApp().use(router))
  return fetch(new Request(`https://example.test/sites/${siteId}/content`, {
    method, body, headers: body === undefined ? {} : { 'content-type': contentType }
  }))
}

describe('business content HTTP authentication and body boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'tenant_test', user: { id: 'staff_test' } })
    mocks.portal.mockResolvedValue({ id: 'portal_test', clientId: 'client_test', role: 'admin' })
    mocks.read.mockResolvedValue({ content: null, revision: 0 })
    mocks.write.mockResolvedValue({ revision: 1 })
  })
  it.each(['agency', 'portal'] as const)('uses authenticated %s identity for reads and writes', async (audience) => {
    expect((await request(audience, 'GET')).status).toBe(200)
    expect((await request(audience, 'POST', JSON.stringify({ collections: [], expectedRevision: 0 }))).status).toBe(200)
    const expected = audience === 'agency'
      ? { role: 'agency', actorId: 'staff_test', tenantId: 'tenant_test', canEdit: true }
      : { role: 'client', actorId: 'portal_test', clientId: 'client_test' }
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId }))
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId, body: { collections: [], expectedRevision: 0 } }))
    if (audience === 'agency') {
      expect(mocks.agency.mock.calls.map(call => call[1])).toEqual(['PAGE_STUDIO_EDIT', 'PAGE_STUDIO_EDIT'])
    }
  })
  it.each(['agency', 'portal'] as const)('stops before content access when %s auth fails', async (audience) => {
    mocks[audience].mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request(audience, 'POST', '{}')).status).toBe(401)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects a portal viewer before reading the body or creating resources', async () => {
    mocks.portal.mockResolvedValue({ id: 'portal_test', clientId: 'client_test', role: 'viewer' })
    expect((await request('portal', 'POST', '{broken')).status).toBe(403)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('keeps status reads side-effect free and uncached', async () => {
    const response = await request('agency', 'GET')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
