import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregate, fixture, installBookingHttpGlobals, scope, siteId, siteRow } from '../../fixtures/pageStudioBookings'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), enabled: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: (...args: unknown[]) => mocks.query(...args) }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.auth(...args) }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.auth(...args) }))
vi.mock('~~/server/utils/turnstile', () => ({ isTurnstileEnabled: () => mocks.enabled(), verifyTurnstile: (...args: unknown[]) => mocks.verify(...args) }))
installBookingHttpGlobals()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ tenantId: scope.tenantId, user: { id: 'operator-1' }, id: 'user-1', clientId: scope.clientId })
  mocks.query.mockResolvedValue(siteRow)
  mocks.enabled.mockReturnValue(true)
  mocks.verify.mockResolvedValue(true)
})

describe('portal booking list through scoped adapter', () => {
  it('uses authenticated client and user membership with the selected site', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    const { event, service } = fixture()
    await expect(handler(event as never)).resolves.toEqual({ clientId: scope.clientId, siteId, bookings: [aggregate()] })
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('membership.user_id = $3'), [scope.clientId, siteId, 'user-1'])
    expect(service.listScopedBookings).toHaveBeenCalledWith(scope, { limit: 50 })
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'cache-control', 'private, no-store')
  })
  it.each([null, { ...siteRow, membership_role: null }, { ...siteRow, entitlement_effective: false }])('rejects missing site or access: %j', async (row) => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    const { event, service } = fixture()
    mocks.query.mockResolvedValue(row)
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: row ? 403 : 404 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('rejects client identity injected into the query', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    const { event, service } = fixture()
    await expect(handler({ ...event, query: { siteId, clientId: 'other-client' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('never returns a different site from the Worker', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    const { event, service } = fixture()
    const result = aggregate()
    service.listScopedBookings.mockResolvedValue([{ ...result, booking: { ...result.booking, scope: { ...scope, siteId: 'foreign-site' } } }])
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 502, data: { error: { code: 'BOOKING_RESPONSE_INVALID' } } })
  })
})
