import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.access(...args) }))
const globals = globalThis as typeof globalThis & { eventHandler: <T>(handler: T) => T, getRouterParam: (event: { bookingId?: string }) => string | undefined, readBody: (event: { body?: unknown }) => Promise<unknown>, createError: (input: Record<string, unknown>) => Error & Record<string, unknown> }
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.bookingId
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('agency Page Studio booking commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 't1', user: { id: 'operator-1' } })
  })
  it('derives the operator actor from permissioned agency auth', async () => {
    const binding = { listBookings: vi.fn(), applyAuthorizedBooking: vi.fn().mockResolvedValue({ event: { nextStatus: 'approved' } }) }
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/[bookingId]/command.post')
    await expect(handler({ bookingId: 'b1', body: { actor: 'operator', bookingId: 'b1', expectedVersion: 1, idempotencyKey: 'cmd-1', nextStatus: 'approved' }, context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: binding } } } } as never)).resolves.toEqual({ actorId: 'operator-1', booking: { event: { nextStatus: 'approved' } } })
    expect(binding.applyAuthorizedBooking).toHaveBeenCalledWith('operator', 'b1', expect.objectContaining({ nextStatus: 'approved' }))
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_APPROVE')
  })
  it('rejects a command whose body booking id does not match the route', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings/[bookingId]/command.post')
    await expect(handler({ bookingId: 'b1', body: { actor: 'operator', bookingId: 'b2', expectedVersion: 1, idempotencyKey: 'cmd-1', nextStatus: 'approved' }, context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
