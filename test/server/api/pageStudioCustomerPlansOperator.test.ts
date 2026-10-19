import { createApp, createError, eventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), grant: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/customerPlanTargets', () => ({ listCustomerPlanTargets: mocks.list }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ grantCustomerPublishingPlan: mocks.grant }))
vi.stubGlobal('eventHandler', eventHandler)
vi.stubGlobal('createError', createError)
const { default: read } = await import('~~/server/api/agency/page-studio/customer-plans.get')
const { default: write } = await import('~~/server/api/agency/page-studio/customer-plans.post')
const actorId = '10000000-0000-4000-8000-000000000001'
function request(method: 'GET' | 'POST', options: { origin?: string, body?: string, contentType?: string, query?: string } = {}) {
  const app = createApp().use(method === 'GET' ? read : write)
  return toWebHandler(app)(new Request(`https://app.example/api/agency/page-studio/customer-plans${options.query ?? ''}`, {
    method, ...(method === 'POST' ? { body: options.body ?? '{}' } : {}), headers: {
      'host': 'app.example', 'x-forwarded-proto': 'https', 'origin': options.origin ?? 'https://app.example',
      'content-type': options.contentType ?? 'application/json'
    }
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: actorId })
  mocks.list.mockResolvedValue({ targets: [], nextCursor: null })
  mocks.grant.mockResolvedValue({ entitlement: { id: 'saved' }, replayed: false })
})
describe('platform operator native plan HTTP boundary', () => {
  it('uses the authenticated staff actor for reads', async () => {
    const response = await request('GET')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.list).toHaveBeenCalledWith(actorId, {})
  })
  it('uses the authenticated staff actor for grants', async () => {
    const response = await request('POST', { body: '{"requestId":"test"}' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.grant).toHaveBeenCalledWith({ actorId, body: { requestId: 'test' } })
  })
  it.each(['GET', 'POST'] as const)('requires agency authentication for %s', async (method) => {
    mocks.auth.mockRejectedValue(createError({ statusCode: 401 }))
    expect((await request(method)).status).toBe(401)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it.each(['GET', 'POST'] as const)('preserves fresh operator denial for %s', async (method) => {
    mocks.list.mockRejectedValue(createError({ statusCode: 403 }))
    mocks.grant.mockRejectedValue(createError({ statusCode: 403 }))
    expect((await request(method)).status).toBe(403)
  })
  it.each([
    { origin: 'https://foreign.example', expected: 403 },
    { origin: '', expected: 403 },
    { contentType: 'text/plain', expected: 415 },
    { body: 'x'.repeat(4097), expected: 413 },
    { body: '{', expected: 400 },
    { query: '?tenantId=forged', expected: 400 }
  ])('rejects malformed or cross-origin grant %j', async ({ expected, ...options }) => {
    expect((await request('POST', options)).status).toBe(expected)
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it('redacts unexpected database errors', async () => {
    mocks.grant.mockRejectedValue(new Error('postgresql://private-secret'))
    const response = await request('POST')
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private-secret')
  })
})
