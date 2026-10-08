import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/pageStudio/invitedAccess', () => ({ readInvitedSiteAccess: mocks.read, writeInvitedSiteAccess: mocks.write }))
vi.mock('~~/server/utils/pageStudio/invitedOrigin', () => ({ pageStudioInvitedOrigin: () => 'https://xeroflowpages.com' }))
vi.stubGlobal('eventHandler', eventHandler)
const { default: get } = await import('~~/server/api/agency/page-studio/sites/[siteId]/members.get')
const { default: put } = await import('~~/server/api/agency/page-studio/sites/[siteId]/members.put')
const siteId = '10000000-0000-4000-8000-000000000001', userId = '20000000-0000-4000-8000-000000000001'
const actorId = '30000000-0000-4000-8000-000000000001'
const body = JSON.stringify({ userId, role: 'editor' })
function request(method: 'GET' | 'PUT', data = body, origin = 'https://app.example', contentType = 'application/json') {
  const router = createRouter().get('/sites/:siteId/members', get).put('/sites/:siteId/members', put)
  return toWebHandler(createApp().use(router))(new Request(`https://app.example/sites/${siteId}/members`, {
    method, ...(method === 'PUT' ? { body: data } : {}), headers: { 'origin': origin, 'host': 'app.example', 'x-forwarded-proto': 'https', 'content-type': contentType }
  }))
}
describe('CMS access HTTP boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockReset()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-a', user: { id: actorId } })
    mocks.read.mockResolvedValue({ name: 'Fantasy Limo', users: [] })
    mocks.write.mockResolvedValue({ role: 'editor' })
  })
  it('returns a configured standalone CMS URL and disables caching', async () => {
    const response = await request('GET')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ cmsUrl: `https://xeroflowpages.com/studio/sites/${siteId}` })
  })
  it('derives the grant actor and tenant from authentication', async () => {
    expect((await request('PUT')).status).toBe(200)
    expect(mocks.write).toHaveBeenCalledWith({ tenantId: 'tenant-a', actorId, siteId, userId, role: 'editor' })
  })
  it('rejects unauthenticated writes and permission failures before assignment', async () => {
    mocks.access.mockRejectedValueOnce(createError({ statusCode: 401 })).mockRejectedValueOnce(createError({ statusCode: 403 }))
    expect((await request('PUT')).status).toBe(401)
    expect((await request('PUT')).status).toBe(403)
    expect(mocks.write).not.toHaveBeenCalled()
  })
  it('rejects cross-origin, malformed, oversized and fabricated actor payloads', async () => {
    expect((await request('PUT', body, 'https://attacker.example')).status).toBe(403)
    expect((await request('PUT', '{bad')).status).toBe(400)
    expect((await request('PUT', 'x'.repeat(2049))).status).toBe(413)
    expect((await request('PUT', JSON.stringify({ userId, role: 'editor', actorId }))).status).toBe(400)
    expect((await request('PUT', body, 'https://app.example', 'text/plain')).status).toBe(415)
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
