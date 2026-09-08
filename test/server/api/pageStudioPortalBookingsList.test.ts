import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireClientAuth: vi.fn(), list: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args) }))
vi.mock('~~/server/utils/pageStudio/bookingsBinding', () => ({ listScopedPageStudioBookings: (...args: unknown[]) => mocks.list(...args) }))

const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getQuery: (event: { query?: unknown }) => unknown
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getQuery = event => event.query ?? {}
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal Page Studio booking list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({ id: 'user-1', clientId: 'client-1' })
    mocks.list.mockResolvedValue([{ id: 'booking-1', status: 'enquiry' }])
  })

  it('lists bookings through the client-scoped private binding', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    await expect(handler({ query: { status: 'enquiry', limit: '10' }, context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: {} } } } } as never)).resolves.toEqual({ clientId: 'client-1', bookings: [{ id: 'booking-1', status: 'enquiry' }] })
    expect(mocks.list).toHaveBeenCalledWith({}, { status: 'enquiry', limit: 10 })
  })

  it('fails closed when the booking service is unavailable', async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error('unavailable'), { statusCode: 503 }))
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.get')
    await expect(handler({ query: {}, context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
  })
})
