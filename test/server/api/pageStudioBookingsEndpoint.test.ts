import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.access(...args) }))
const globals = globalThis as typeof globalThis & { eventHandler: <T>(handler: T) => T, getQuery: (event: { query?: unknown }) => unknown, createError: (input: Record<string, unknown>) => Error & Record<string, unknown> }
globals.eventHandler = handler => handler
globals.getQuery = event => event.query ?? {}
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('agency Page Studio booking queue endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ tenantId: 'tenant-1', user: { id: 'operator-1' } })
  })

  it('fails closed until the private booking Worker binding is configured', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    await expect(handler({ query: {}, context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_VIEW')
  })

  it('returns the scoped queue from the binding', async () => {
    const binding = { listBookings: vi.fn().mockResolvedValue([{ id: 'booking-1', status: 'quoted' }]) }
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    await expect(handler({ query: { status: 'quoted', limit: '10' }, context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: binding } } } } as never)).resolves.toEqual({ tenantId: 'tenant-1', bookings: [expect.objectContaining({ id: 'booking-1', status: 'quoted', version: 0 })] })
    expect(binding.listBookings).toHaveBeenCalledWith({ status: 'quoted', limit: 10 })
  })
})
