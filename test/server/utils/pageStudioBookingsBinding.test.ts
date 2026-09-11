import { describe, expect, it, vi } from 'vitest'
import { listScopedPageStudioBookings, createScopedPageStudioBooking, applyScopedPageStudioBooking } from '~~/server/utils/pageStudio/bookingsBinding'

const siteId = '11111111-1111-4111-8111-111111111111'
const scope = { tenantId: 'tenant-1', clientId: 'client-1', businessId: 'business-1', siteId, environment: 'staging' as const }
const actor = { role: 'client' as const, actorId: 'user-1', clientId: 'client-1' }
const row = { tenant_id: 'tenant-1', client_id: 'client-1', site_status: 'active', entitlement_status: 'active', entitlement_effective: true, membership_role: 'editor', plan_metadata: { allowedModules: ['bookings'] } }
const booking = { id: 'booking-1', scope, createdAt: '2026-09-09T00:00:00Z', requestedAt: '2026-09-09T00:00:00Z', customer: { name: 'Guest', email: 'guest@example.com', phone: '+61400000000' }, pickup: 'Airport', dropoff: 'Hotel', travelAt: '2026-10-01T00:00:00Z', durationMinutes: 60, passengers: 2, occasion: 'Transfer', vehicleId: null, quote: null, status: 'enquiry' }
const aggregate = { booking, version: 0, processedCommands: [] }
function setup(overrides = {}) {
  const service = { listScopedBookings: vi.fn().mockResolvedValue([aggregate]), readScopedBooking: vi.fn().mockResolvedValue(aggregate), createScopedBooking: vi.fn().mockResolvedValue(aggregate), applyScopedBookingCommand: vi.fn().mockResolvedValue({ aggregate: { ...aggregate, booking: { ...booking, status: 'cancelled' }, version: 1 }, event: null }) }
  const env = { PAGE_STUDIO_BOOKING_ENVIRONMENT: 'staging', PAGE_STUDIO_BOOKING_BINDINGS: JSON.stringify([{ scope, bindingName: 'BOOKING_ONE', entrypoint: 'ScopedBookingsEntrypoint' }]), BOOKING_ONE: service }
  const query = vi.fn().mockResolvedValue({ ...row, ...overrides })
  return { request: { actor, siteId, env }, service, query }
}

describe('authenticated booking site adapter', () => {
  it('derives full scope from an authorized site and named binding', async () => {
    const { request, query, service } = setup()
    expect(await listScopedPageStudioBookings(request, { limit: 10 }, { query })).toEqual([aggregate])
    expect(query.mock.calls[0]?.[1]).toEqual([actor.clientId, siteId, actor.actorId])
    expect(service.listScopedBookings).toHaveBeenCalledWith(scope, { limit: 10 })
  })
  it.each([{ membership_role: null }, { entitlement_status: 'cancelled' }, { entitlement_effective: false }, { site_status: 'suspended' }, { plan_metadata: {} }, { plan_metadata: { allowedModules: ['catalogue'] } }])('denies unavailable membership, site or booking entitlement: %j', async (override) => {
    const { request, query, service } = setup(override)
    await expect(listScopedPageStudioBookings(request, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('denies a foreign site before any RPC', async () => {
    const { request, query, service } = setup()
    query.mockResolvedValueOnce(null)
    await expect(listScopedPageStudioBookings(request, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 404 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('rejects foreign, ambiguous and legacy binding configurations', async () => {
    const { request, query, service } = setup()
    const binding = JSON.parse(request.env.PAGE_STUDIO_BOOKING_BINDINGS)[0]
    for (const entries of [[], [binding, binding], [{ ...binding, scope: { ...scope, siteId: 'other' } }], [{ ...binding, entrypoint: 'default' }]]) {
      request.env.PAGE_STUDIO_BOOKING_BINDINGS = JSON.stringify(entries)
      await expect(listScopedPageStudioBookings(request, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 503 })
    }
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it.each(['tenantId', 'clientId', 'businessId', 'siteId', 'environment'])('rejects response %s mismatches', async (field) => {
    const { request, query, service } = setup()
    service.listScopedBookings.mockResolvedValueOnce([{ ...aggregate, booking: { ...booking, scope: { ...scope, [field]: field === 'environment' ? 'production' : 'foreign' } } }])
    await expect(listScopedPageStudioBookings(request, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('maps enquiries to canonical IDs and server-owned initial state', async () => {
    const { request, query, service } = setup()
    const { id, scope: _scope, status: _status, quote: _quote, createdAt: _created, requestedAt: _requested, ...input } = booking
    await createScopedPageStudioBooking(request, { ...input, bookingId: id, requestKey: 'request-1' }, { query })
    const [sentScope, sentBooking, key] = service.createScopedBooking.mock.calls[0]!
    expect(sentScope).toEqual(scope)
    expect(sentBooking).toMatchObject({ id, scope, status: 'enquiry', quote: null, vehicleId: null })
    expect(sentBooking).not.toHaveProperty('bookingId')
    expect(sentBooking).not.toHaveProperty('requestKey')
    expect(key).toBe('request-1')
  })
  it('denies viewer creation and client operator commands', async () => {
    const { request, query, service } = setup({ membership_role: 'viewer' })
    await expect(createScopedPageStudioBooking(request, {}, { query })).rejects.toMatchObject({ statusCode: 403 })
    await expect(applyScopedPageStudioBooking(request, 'booking-1', {}, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(service.createScopedBooking).not.toHaveBeenCalled()
    expect(service.applyScopedBookingCommand).not.toHaveBeenCalled()
  })
  it('uses agency organization scope and strips transport-only command fields', async () => {
    const { request, query, service } = setup()
    const command = { actor: 'operator', bookingId: 'booking-1', expectedVersion: 0, idempotencyKey: 'command-1', nextStatus: 'cancelled' }
    await applyScopedPageStudioBooking({ ...request, actor: { role: 'agency', actorId: 'operator-1', tenantId: 'tenant-1', canApprove: true } }, 'booking-1', command, { query })
    expect(query.mock.calls[0]?.[0]).toContain('xero_org_connection')
    expect(query.mock.calls[0]?.[1]).toEqual(['tenant-1', siteId])
    expect(service.applyScopedBookingCommand).toHaveBeenCalledWith(scope, 'operator', 'booking-1', { actor: 'operator', expectedVersion: 0, idempotencyKey: 'command-1', nextStatus: 'cancelled' })
  })
  it('hides upstream details', async () => {
    const { request, query, service } = setup()
    service.listScopedBookings.mockRejectedValueOnce(new Error('secret database details'))
    await expect(listScopedPageStudioBookings(request, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 502, message: 'Booking service is unavailable' })
  })
})
