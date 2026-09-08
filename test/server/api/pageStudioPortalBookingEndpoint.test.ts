import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireClientAuth = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth }))
const globals = globalThis as typeof globalThis & { eventHandler: <T>(handler: T) => T, readBody: (event: { body?: unknown }) => Promise<unknown>, getHeader: (event: { headers?: Record<string, string> }, name: string) => string | undefined, createError: (input: Record<string, unknown>) => Error & Record<string, unknown> }
globals.eventHandler = handler => handler
globals.readBody = async event => event.body
globals.getHeader = (event, name) => event.headers?.[name]
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
describe('portal booking enquiry endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireClientAuth.mockResolvedValue({ clientId: 'client-1', id: 'user-1', role: 'manager' })
  })
  it('forwards a validated, scoped enquiry with Turnstile evidence', async () => {
    const binding = { createBooking: vi.fn().mockResolvedValue({ id: 'b1', status: 'enquiry' }) }
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    const body = { bookingId: 'b1', requestKey: 'request-1', customer: { name: 'Alex', email: 'alex@example.com', phone: '0400000000' }, pickup: 'Airport', dropoff: 'Hotel', travelAt: '2026-10-01T10:00:00.000Z', durationMinutes: 60, passengers: 2, occasion: 'Transfer', vehicleId: null }
    await expect(handler({ body, headers: { 'x-turnstile-token': 'token' }, context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: binding } } } } as never)).resolves.toEqual({ booking: { id: 'b1', status: 'enquiry' } })
    expect(binding.createBooking).toHaveBeenCalledWith(expect.objectContaining({ scope: expect.objectContaining({ clientId: 'client-1' }) }), 'request-1')
  })
  it('rejects requests without Turnstile evidence', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/bookings.post')
    await expect(handler({ body: {}, headers: {}, context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
