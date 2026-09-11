import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture, installBookingHttpGlobals, scope, siteRow } from '../../fixtures/pageStudioBookings'

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

const command = { actor: 'operator', bookingId: 'booking-1', expectedVersion: 0, idempotencyKey: 'cmd-1', nextStatus: 'approved', vehicleId: 'limo-1' }
describe('scoped operator commands', () => {
  it('requires approval permission and removes the transport booking ID before RPC', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/[bookingId]/command.post')
    const { event, service } = fixture()
    await expect(handler({ ...event, bookingId: 'booking-1', body: command } as never)).resolves.toMatchObject({ actorId: 'operator-1', booking: { aggregate: { booking: { id: 'booking-1', status: 'approved' }, version: 1 } } })
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_APPROVE')
    expect(service.applyScopedBookingCommand).toHaveBeenCalledWith(scope, 'operator', 'booking-1', { actor: 'operator', expectedVersion: 0, idempotencyKey: 'cmd-1', nextStatus: 'approved', vehicleId: 'limo-1' })
  })
  it.each([{ ...command, bookingId: 'other' }, { ...command, actor: 'customer' }, { ...command, scope }])('rejects invalid or authority-bearing commands: %j', async (body) => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/[bookingId]/command.post')
    const { event, service } = fixture()
    await expect(handler({ ...event, bookingId: 'booking-1', body } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(service.applyScopedBookingCommand).not.toHaveBeenCalled()
  })
  it('denies a command for an unavailable site', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/[bookingId]/command.post')
    const { event, service } = fixture()
    mocks.query.mockResolvedValue(null)
    await expect(handler({ ...event, bookingId: 'booking-1', body: command } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(service.applyScopedBookingCommand).not.toHaveBeenCalled()
  })
})
