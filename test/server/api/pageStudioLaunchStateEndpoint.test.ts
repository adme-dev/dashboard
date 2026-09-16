import { createApp, createRouter, toWebHandler, createError, eventHandler, getRouterParam, setHeader } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/pageStudio/launchState', () => ({ readPageStudioLaunchState: mocks.read }))
const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const bucket = { get: vi.fn() }

async function request(id = siteId) {
  const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/launch-state.get')
  const router = createRouter().get('/sites/:siteId/launch-state', handler)
  const app = createApp().use((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_CHECKPOINTS: bucket } }
  }).use(router)
  return toWebHandler(app)(new Request(`https://example.test/sites/${id}/launch-state?tenantId=forged&siteId=forged`))
}

describe('launch state HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const [key, value] of Object.entries({ eventHandler, getRouterParam, createError, setHeader })) vi.stubGlobal(key, value)
    mocks.access.mockResolvedValue({ tenantId: 'authenticated_tenant' })
    mocks.read.mockResolvedValue({ siteId })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('uses authenticated scope and trusted storage and disables response caching', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_VIEW')
    expect(mocks.read).toHaveBeenCalledWith({ tenantId: 'authenticated_tenant', siteId, bucket })
  })
  it.each([401, 403])('stops before content access for denied identity (%s)', async (statusCode) => {
    mocks.access.mockRejectedValue(createError({ statusCode }))
    expect((await request()).status).toBe(statusCode)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('rejects malformed site identities before storage access', async () => {
    expect((await request('bad-id')).status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('preserves a scoped not-found result', async () => {
    mocks.read.mockRejectedValue(createError({ statusCode: 404 }))
    expect((await request()).status).toBe(404)
  })
})
