import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), grant: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/pageStudio/entitlementGrants', () => ({ grantPageStudioEntitlement: mocks.grant }))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
const { default: handler } = await import('~~/server/api/agency/page-studio/subscriptions.post')

describe('website access grant endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ user: { id: 'current-admin' }, tenantId: 'selected-tenant' })
    mocks.grant.mockResolvedValue({ entitlement: { id: 'saved' }, replayed: false })
  })
  it('derives tenant and actor from subscription permission checks', async () => {
    const event = { body: { clientId: 'selected-client' } }
    await handler(event as never)
    expect(mocks.access).toHaveBeenCalledWith(event, 'PAGE_STUDIO_SUBSCRIPTIONS')
    expect(mocks.grant).toHaveBeenCalledWith({ actorId: 'current-admin', tenantId: 'selected-tenant', body: event.body })
  })
  it('never grants when permission is denied', async () => {
    mocks.access.mockRejectedValue({ statusCode: 403 })
    await expect(handler({ body: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.grant).not.toHaveBeenCalled()
  })
})
