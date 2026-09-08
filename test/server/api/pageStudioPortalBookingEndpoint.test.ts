import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enquiry, fixture, installBookingHttpGlobals, scope, siteId, siteRow } from '../../fixtures/pageStudioBookings'

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

describe('portal booking enquiry through scoped adapter', () => {
  function request() {
    const data = fixture()
    return { ...data, event: { ...data.event, body: enquiry, headers: { 'x-turnstile-token': 'token', 'cf-connecting-ip': '203.0.113.1' } } }
  }
  it('verifies Turnstile and creates a canonical enquiry in the authenticated site', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const { event, service } = request()
    await expect(handler(event as never)).resolves.toMatchObject({ booking: { booking: { id: 'booking-1', status: 'enquiry', scope }, version: 0 } })
    expect(mocks.verify).toHaveBeenCalledWith('token', '203.0.113.1')
    expect(service.createScopedBooking).toHaveBeenCalledWith(scope, expect.objectContaining({ id: 'booking-1', status: 'enquiry', scope, quote: null, vehicleId: null }), 'request-1')
    const sent = service.createScopedBooking.mock.calls[0]![1]
    expect(sent).not.toHaveProperty('bookingId')
    expect(sent).not.toHaveProperty('requestKey')
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [scope.clientId, siteId, 'user-1'])
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'cache-control', 'private, no-store')
  })
  it.each([{ enabled: false, valid: true, code: 503 }, { enabled: true, valid: false, code: 403 }])('fails closed for unavailable or failed captcha: %j', async ({ enabled, valid, code }) => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const { event, service } = request()
    mocks.enabled.mockReturnValue(enabled)
    mocks.verify.mockResolvedValue(valid)
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: code })
    expect(service.createScopedBooking).not.toHaveBeenCalled()
  })
  it.each([{ scope }, { status: 'approved' }, { vehicleId: 'limo-1' }, { quote: { amountCents: 0 } }])('rejects client-supplied authority or initial state: %j', async (extra) => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const { event, service } = request()
    await expect(handler({ ...event, body: { ...enquiry, ...extra } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(service.createScopedBooking).not.toHaveBeenCalled()
  })
  it('denies a viewer from creating enquiries', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const { event, service } = request()
    mocks.query.mockResolvedValue({ ...siteRow, membership_role: 'viewer' })
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(service.createScopedBooking).not.toHaveBeenCalled()
  })
  it('rejects requests without captcha evidence', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const { event, service } = request()
    await expect(handler({ ...event, headers: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(service.createScopedBooking).not.toHaveBeenCalled()
  })
})
