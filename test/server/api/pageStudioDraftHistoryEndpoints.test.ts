import { createApp, createRouter, toWebHandler, createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioHistory } from '~~/server/utils/pageStudio/draftHistoryHttp'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/draftHistory', async original => ({
  ...await original<typeof import('~~/server/utils/pageStudio/draftHistory')>(),
  readPageStudioHistory: mocks.read, mutatePageStudioHistory: mocks.write
}))

const body = { action: 'name', name: 'Before redesign', expectedCheckpointId: 'checkpoint_saved', requestId: 'ab1a22f9-1c8a-44d7-92b2-d4202e4a2020' }
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
function request(audience: 'agency' | 'portal', method: 'GET' | 'POST', body?: string, contentType = 'application/json') {
  const router = createRouter()
  router.add('/sites/:siteId/history', event => handlePageStudioHistory(event, audience, method), [method.toLowerCase() as 'get' | 'post'])
  const fetch = toWebHandler(createApp().use(router))
  return fetch(new Request(`https://example.test/sites/${siteId}/history`, {
    method, body, headers: body === undefined ? {} : { 'content-type': contentType }
  }))
}

describe('draft history HTTP authentication and body boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'tenant_test', user: { id: 'staff_test' } })
    mocks.portal.mockResolvedValue({ id: 'portal_test', clientId: 'client_test' })
    mocks.read.mockResolvedValue({ items: [], currentCheckpointId: null })
    mocks.write.mockResolvedValue({ checkpointId: 'checkpoint_saved', versionId: 'version_saved', isCurrent: true })
  })
  it.each(['agency', 'portal'] as const)('uses authenticated %s identity for reads and writes', async (audience) => {
    expect((await request(audience, 'GET')).status).toBe(200)
    expect((await request(audience, 'POST', JSON.stringify(body))).status).toBe(200)
    const expected = audience === 'agency'
      ? { role: 'agency', actorId: 'staff_test', tenantId: 'tenant_test', canEdit: true }
      : { role: 'client', actorId: 'portal_test', clientId: 'client_test' }
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId }))
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ actor: expected, siteId, body }))
    if (audience === 'agency') {
      expect(mocks.agency.mock.calls.map(call => call[1])).toEqual(['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_EDIT'])
    }
  })
  it.each(['agency', 'portal'] as const)('stops before content access when %s auth fails', async (audience) => {
    mocks[audience].mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request(audience, 'POST', '{}')).status).toBe(401)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('keeps viewing available when editing permission is denied', async () => {
    mocks.agency.mockImplementation((_event, permission) => {
      if (permission === 'PAGE_STUDIO_EDIT') throw createError({ statusCode: 403 })
      return { tenantId: 'selected_tenant', user: { id: 'staff_test' } }
    })
    expect((await request('agency', 'GET')).status).toBe(200)
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actor: { role: 'agency', actorId: 'staff_test', tenantId: 'selected_tenant', canEdit: false } }))
    expect((await request('agency', 'POST', '{}')).status).toBe(403)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects oversized, malformed and non-JSON bodies before the service', async () => {
    expect((await request('portal', 'POST', 'x'.repeat(8193))).status).toBe(413)
    expect((await request('portal', 'POST', '{broken')).status).toBe(400)
    expect((await request('portal', 'POST', '{}', 'text/plain')).status).toBe(415)
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
