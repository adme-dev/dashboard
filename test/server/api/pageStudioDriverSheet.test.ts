import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.access(...args) }))
vi.mock('~~/server/utils/pageStudio/bookingsBinding', () => ({ listScopedPageStudioBookings: (...args: unknown[]) => mocks.list(...args) }))

const globals = globalThis as typeof globalThis & { eventHandler: <T>(handler: T) => T }
globals.eventHandler = handler => handler

describe('agency Page Studio driver sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-1' })
    mocks.list.mockImplementation(async (_binding: unknown, options: { status: string }) => options.status === 'approved' ? [{ booking: { id: 'b1', status: 'approved', customer: { name: 'Alex', phone: '0400' }, pickup: 'Airport', dropoff: 'Hotel', travelAt: '2026-10-01T10:00:00Z', passengers: 2, vehicleId: 'van-1', occasion: 'Transfer' } }] : [])
  })

  it('returns normalized approved and customer-confirmed dispatch rows', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/driver-sheet.get')
    await expect(handler({ context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: {} } } } } as never)).resolves.toEqual({ tenantId: 'tenant-1', bookings: [expect.objectContaining({ id: 'b1', customer: 'Alex', vehicleId: 'van-1' })] })
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
})
