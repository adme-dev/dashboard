import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ customer: vi.fn(), list: vi.fn(), respond: vi.fn(), request: vi.fn(), write: vi.fn(), role: vi.fn(), access: vi.fn(), manage: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.customer }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.role, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({ requireSocialPostClientAccess: mocks.access }))
vi.mock('~~/server/utils/socialPublishing/liveOperations', () => ({ manageLiveFacebook: mocks.manage }))
vi.mock('~~/server/utils/socialPublishing/liveReviews', () => ({ listLiveReviews: mocks.list, respondLiveReview: mocks.respond, requestLiveReview: mocks.request }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => '11111111-1111-4111-8111-111111111111')
vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const { default: list } = await import('../../../server/api/portal/social/live-reviews/index.get')
const { default: respond } = await import('../../../server/api/portal/social/live-reviews/[id]/respond.post')
const { default: request } = await import('../../../server/api/agency/social/publishing/posts/[id]/live.post')
const body = { operationId: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222', action: 'edit', expectedMessage: 'Original', message: 'Revised', confirmed: true, requestReview: true }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.customer.mockResolvedValue({ id: 'customer', clientId: 'session-client', permissions: { canApproveWork: true } })
  mocks.write.mockResolvedValue({ id: 'manager' })
  mocks.access.mockResolvedValue({ id: 'post', client_id: 'scoped-client' })
})
describe('customer live review authority', () => {
  it('scopes reads to the authenticated customer', async () => {
    await list({ query: { clientId: 'foreign' } } as never)
    expect(mocks.list).toHaveBeenCalledWith('session-client')
  })
  it('uses session ownership and never calls provider operations for a customer decision', async () => {
    await respond({ body: { action: 'approve' } } as never)
    expect(mocks.respond).toHaveBeenCalledWith('session-client', 'customer', body.operationId, 'approve', '')
    expect(mocks.manage).not.toHaveBeenCalled()
  })
  it('requires customer approval permission for reading and responding', async () => {
    mocks.customer.mockResolvedValue({ permissions: {} })
    await expect(list({} as never)).rejects.toMatchObject({ statusCode: 403 })
    await expect(respond({ body: { action: 'approve' } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.respond).not.toHaveBeenCalled()
  })
  it('rejects caller-supplied client or caption fields on a decision', async () => {
    await expect(respond({ body: { action: 'approve', clientId: 'foreign', message: 'Injected' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.respond).not.toHaveBeenCalled()
  })
  it('routes a staff review request separately from provider mutations', async () => {
    await request({ body } as never)
    expect(mocks.request).toHaveBeenCalledWith('post', 'scoped-client', 'manager', body)
    expect(mocks.manage).not.toHaveBeenCalled()
  })
  it.each(['write', 'role', 'access'] as const)('enforces %s authority before creating a review', async (guard) => {
    mocks[guard].mockRejectedValue(new Error('Forbidden'))
    await expect(request({ body } as never)).rejects.toThrow('Forbidden')
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
