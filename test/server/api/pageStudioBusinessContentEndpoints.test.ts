import { createApp, createRouter, toWebHandler, createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContentHttp'

vi.mock('~~/server/utils/db', async original => ({
  ...await original<typeof import('~~/server/utils/db')>(), queryOneFresh: mocks.trustedTenant
}))

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), read: vi.fn(), write: vi.fn(), trustedTenant: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/businessContent', async original => ({
  ...await original<typeof import('~~/server/utils/pageStudio/businessContent')>(),
  readPageStudioBusinessContent: mocks.read, writePageStudioBusinessContent: mocks.write
}))

const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
function request(audience: 'agency' | 'portal', method: 'GET' | 'PUT', body?: string, contentType = 'application/json') {
  const router = createRouter()
  router.add('/sites/:siteId/content', event => handlePageStudioBusinessContent(event, audience, method), [method.toLowerCase() as 'get' | 'put'])
  const fetch = toWebHandler(createApp().use(router))
  return fetch(new Request(`https://example.test/sites/${siteId}/content`, {
    method, body, headers: body === undefined ? {} : { 'content-type': contentType }
  }))
}

describe('business content HTTP authentication and body boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.trustedTenant.mockResolvedValue({ tenant_id: 'tenant_test' })
    mocks.agency.mockResolvedValue({ tenantId: 'tenant_test', user: { id: 'staff_test' } })
    mocks.portal.mockResolvedValue({ id: 'portal_test', clientId: 'client_test' })
    mocks.read.mockResolvedValue({ content: null, revision: 0 })
    mocks.write.mockResolvedValue({ revision: 1 })
  })
  it.each(['agency', 'portal'] as const)('uses authenticated %s identity for reads and writes', async (audience) => {
    expect((await request(audience, 'GET')).status).toBe(200)
    expect((await request(audience, 'PUT', JSON.stringify({ collections: [], expectedRevision: 0 }))).status).toBe(200)
    const expected = audience === 'agency'
      ? { role: 'agency', actorId: 'staff_test', tenantId: 'tenant_test', canEdit: true }
      : { role: 'client', actorId: 'portal_test', clientId: 'client_test' }
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId }))
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId, body: { collections: [], expectedRevision: 0 } }))
    if (audience === 'agency') {
      expect(mocks.agency.mock.calls.map(call => call[1])).toEqual(['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_EDIT'])
    }
  })
  it.each(['agency', 'portal'] as const)('stops before content access when %s auth fails', async (audience) => {
    mocks[audience].mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request(audience, 'PUT', '{}')).status).toBe(401)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects a forged or unassociated agency tenant before content access', async () => {
    for (const tenant of [null, { tenant_id: 'other_tenant' }]) {
      mocks.trustedTenant.mockResolvedValueOnce(tenant)
      expect((await request('agency', 'GET')).status).toBe(403)
    }
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('rejects oversized, malformed and non-JSON bodies before the service', async () => {
    expect((await request('portal', 'PUT', 'x'.repeat(512_001))).status).toBe(413)
    expect((await request('portal', 'PUT', '{broken')).status).toBe(400)
    expect((await request('portal', 'PUT', '{}', 'text/plain')).status).toBe(415)
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
