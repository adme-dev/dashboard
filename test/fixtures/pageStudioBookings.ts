import { vi } from 'vitest'

export const siteId = '11111111-1111-4111-8111-111111111111'
export const scope = { tenantId: 'tenant-1', clientId: 'client-1', businessId: 'business-1', siteId, environment: 'staging' as const }
export const siteRow = { tenant_id: scope.tenantId, client_id: scope.clientId, site_status: 'active', entitlement_status: 'active', entitlement_effective: true, membership_role: 'editor', plan_metadata: { allowedModules: ['bookings'] } }
export const enquiry = { bookingId: 'booking-1', requestKey: 'request-1', customer: { name: 'Alex', email: 'alex@example.com', phone: '0400000000' }, pickup: 'Airport', dropoff: 'Hotel', travelAt: '2026-10-01T10:00:00.000Z', durationMinutes: 60, passengers: 2, occasion: 'Transfer', vehicleId: null }
export function aggregate(status = 'enquiry') {
  const { bookingId, requestKey: _requestKey, ...trip } = enquiry
  return { booking: { ...trip, id: bookingId, scope, status, quote: null, createdAt: '2026-09-09T00:00:00Z', requestedAt: '2026-09-09T00:00:00Z' }, version: 0, processedCommands: [] }
}
export function fixture() {
  const service = {
    listScopedBookings: vi.fn().mockResolvedValue([aggregate()]),
    readScopedBooking: vi.fn().mockResolvedValue(aggregate()),
    createScopedBooking: vi.fn().mockImplementation(async (_scope, booking) => ({ booking, version: 0, processedCommands: [] })),
    applyScopedBookingCommand: vi.fn().mockResolvedValue({ aggregate: { ...aggregate('approved'), version: 1 }, event: null })
  }
  const env = { PAGE_STUDIO_BOOKING_ENVIRONMENT: 'staging', PAGE_STUDIO_BOOKING_BINDINGS: JSON.stringify([{ scope, bindingName: 'BOOKING_ONE', entrypoint: 'ScopedBookingsEntrypoint' }]), BOOKING_ONE: service }
  return { service, env, event: { query: { siteId }, context: { cloudflare: { env } } } }
}
export function installBookingHttpGlobals() {
  vi.stubGlobal('eventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query ?? {})
  vi.stubGlobal('getRouterParam', (event: { bookingId?: string }) => event.bookingId)
  vi.stubGlobal('readBody', async (event: { body?: unknown }) => event.body)
  vi.stubGlobal('getHeader', (event: { headers?: Record<string, string> }, name: string) => event.headers?.[name])
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input))
}
