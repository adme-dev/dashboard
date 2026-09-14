import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScopedPageStudioBooking, listScopedPageStudioBookings, type PageStudioBookingRequest } from '~~/server/utils/pageStudio/bookingsBinding'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const scope = { businessId: clientId, clientId, siteId, tenantId: 'tenant-selected', environment: 'staging' }
const row = { tenant_id: scope.tenantId, client_id: clientId, site_status: 'active', entitlement_status: 'active', entitlement_effective: true, plan_metadata: { allowedModules: ['bookings'] } }
const aggregate = {
  booking: { id: 'booking-1', scope, createdAt: '2026-09-14T00:00:00.000Z', requestedAt: '2026-09-14T00:00:00.000Z', customer: { name: 'Synthetic Customer', email: 'test@example.invalid', phone: '0400000000' }, pickup: 'A', dropoff: 'B', travelAt: '2026-12-01T00:00:00.000Z', durationMinutes: 60, passengers: 2, occasion: '', vehicleId: null, quote: null, status: 'enquiry' },
  version: 0, processedCommands: [] as string[]
}
const command = { actor: 'operator', bookingId: 'booking-1', expectedVersion: 0, idempotencyKey: 'command-1', nextStatus: 'rejected' }
const query = vi.fn()
const list = vi.fn()
const apply = vi.fn()
const request = (): PageStudioBookingRequest => ({ actor: { role: 'agency', actorId: 'staff-1', tenantId: scope.tenantId, canApprove: true }, siteId, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { listScopedBookings: list, applyScopedBookingCommand: apply } } })
beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue(structuredClone(row))
  list.mockResolvedValue([structuredClone(aggregate)])
  apply.mockResolvedValue({ aggregate: { ...structuredClone(aggregate), version: 1, processedCommands: ['command-1'] } })
})
describe('booking operations through the active content router', () => {
  it('derives full scope from a fresh selected-tenant lookup', async () => {
    expect(await listScopedPageStudioBookings(request(), { limit: 10 }, { query })).toEqual([aggregate])
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE site.tenant_id = $1 AND site.id = $2'), [scope.tenantId, siteId])
    expect(query.mock.calls[0]![0]).toContain('client.is_active = TRUE')
    expect(query.mock.calls[0]![0]).not.toContain('xero_org_connection')
    expect(list).toHaveBeenCalledWith(scope, { limit: 10 })
  })
  it.each([null, { ...row, tenant_id: 'foreign' }])('denies a missing or mismatched website', async (value) => {
    query.mockResolvedValue(value)
    await expect(listScopedPageStudioBookings(request(), { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 404 })
    expect(list).not.toHaveBeenCalled()
  })
  it.each([{ site_status: 'archived' }, { entitlement_status: 'cancelled' }, { entitlement_effective: false }, { plan_metadata: { allowedModules: ['enquiries'] } }])('rechecks active booking access: %j', async (patch) => {
    query.mockResolvedValue({ ...row, ...patch })
    await expect(listScopedPageStudioBookings(request(), { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(list).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 'preview', 'invalid'])('fails closed without an explicit runtime environment (%s)', async (environment) => {
    const input = request()
    input.env.PAGE_STUDIO_CONTENT_ENVIRONMENT = environment
    await expect(listScopedPageStudioBookings(input, { limit: 10 }, { query })).rejects.toMatchObject({ code: 'BOOKINGS_UNAVAILABLE' })
    expect(list).not.toHaveBeenCalled()
  })
  it.each(['tenantId', 'clientId', 'businessId', 'siteId', 'environment'])('rejects provider data crossing %s', async (axis) => {
    const value = structuredClone(aggregate)
    Object.assign(value.booking.scope, { [axis]: axis === 'environment' ? 'production' : 'foreign' })
    list.mockResolvedValue([value])
    await expect(listScopedPageStudioBookings(request(), { limit: 10 }, { query })).rejects.toMatchObject({ code: 'BOOKING_RESPONSE_INVALID' })
  })
  it('rejects oversized, duplicate and incorrectly filtered responses', async () => {
    list.mockResolvedValue([aggregate, aggregate])
    await expect(listScopedPageStudioBookings(request(), { limit: 1 }, { query })).rejects.toMatchObject({ statusCode: 502 })
    await expect(listScopedPageStudioBookings(request(), { limit: 2 }, { query })).rejects.toMatchObject({ statusCode: 502 })
    list.mockResolvedValue([aggregate])
    await expect(listScopedPageStudioBookings(request(), { limit: 10, status: 'approved' }, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
  it('denies operator writes before routing for view-only actors', async () => {
    const input = request()
    input.actor.canApprove = false
    await expect(applyScopedPageStudioBooking(input, 'booking-1', command, { query })).rejects.toMatchObject({ statusCode: 403 })
    expect(query).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })
  it('preserves command identity and requires a verified receipt', async () => {
    await applyScopedPageStudioBooking(request(), 'booking-1', command, { query })
    await applyScopedPageStudioBooking(request(), 'booking-1', command, { query })
    const { bookingId: _id, ...payload } = command
    expect(apply).toHaveBeenCalledWith(scope, 'operator', 'booking-1', payload)
    expect(apply.mock.calls[0]).toEqual(apply.mock.calls[1])
    apply.mockResolvedValue({ aggregate })
    await expect(applyScopedPageStudioBooking(request(), 'booking-1', command, { query })).rejects.toMatchObject({ code: 'BOOKING_RESPONSE_INVALID' })
  })
  it('rejects customer commands and mismatched route IDs', async () => {
    await expect(applyScopedPageStudioBooking(request(), 'other', command, { query })).rejects.toMatchObject({ statusCode: 400 })
    await expect(applyScopedPageStudioBooking(request(), 'booking-1', { ...command, actor: 'customer' }, { query })).rejects.toMatchObject({ statusCode: 400 })
    expect(apply).not.toHaveBeenCalled()
  })
  it('does not disclose provider errors', async () => {
    apply.mockRejectedValue(new Error('internal database token'))
    await expect(applyScopedPageStudioBooking(request(), 'booking-1', command, { query })).rejects.toMatchObject({ code: 'BOOKINGS_FAILED', statusCode: 502 })
  })
})
