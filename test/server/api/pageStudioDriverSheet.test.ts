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

describe('scoped driver sheet', () => {
  it('requests only approved and customer-confirmed trips for the selected site', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/driver-sheet.get')
    const { event, service } = fixture()
    service.listScopedBookings.mockImplementation(async (_scope, options) => [aggregate(options.status)])
    const result = await handler(event as never)
    expect(result).toMatchObject({ tenantId: scope.tenantId, siteId, bookings: [expect.objectContaining({ customer: 'Alex', phone: '0400000000', pickup: 'Airport' }), expect.objectContaining({ customer: 'Alex' })] })
    expect(service.listScopedBookings).toHaveBeenCalledWith(scope, { status: 'approved', limit: 100 })
    expect(service.listScopedBookings).toHaveBeenCalledWith(scope, { status: 'customer-confirmed', limit: 100 })
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'cache-control', 'private, no-store')
  })
  it('denies dispatch access before RPC when agency permission is missing', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/driver-sheet.get')
    const { event, service } = fixture()
    mocks.auth.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).not.toHaveBeenCalled()
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
})
