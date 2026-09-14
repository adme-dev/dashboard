import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPortalPageStudioBooking, listPortalPageStudioBookings, type PortalBookingRequest } from '~~/server/utils/pageStudio/portalBookings'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const userId = '10000000-0000-4000-8000-000000000003'
const requestKey = '20000000-0000-4000-8000-000000000001'
const id = `portal-${requestKey}`
const scope = { tenantId: 'client-selected', clientId, businessId: clientId, siteId, environment: 'staging' }
const row = { tenant_id: scope.tenantId, client_id: clientId, site_id: siteId, user_id: userId, user_role: 'manager', membership_role: 'editor', site_status: 'active', entitlement_status: 'active', entitlement_effective: true, plan_metadata: { allowedModules: ['bookings'] } }
const enquiry = { requestKey, customer: { name: 'Synthetic Customer', email: 'test@example.invalid', phone: '0400000000' }, pickup: 'A', dropoff: 'B', travelAt: '2026-12-01T00:00:00.000Z', durationMinutes: 60, passengers: 2, occasion: '' }
const timestamp = '2026-09-14T00:00:00.000Z'
const { requestKey: _key, ...fields } = enquiry
const aggregate = { booking: { ...fields, id, scope, createdAt: timestamp, requestedAt: timestamp, status: 'enquiry', quote: null, vehicleId: null }, version: 0, processedCommands: [] as string[] }
const query = vi.fn()
const read = vi.fn()
const create = vi.fn()
const list = vi.fn()
const request = (): PortalBookingRequest => ({ actor: { userId, clientId, role: 'manager' }, siteId, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { readScopedBooking: read, createScopedBooking: create, listScopedBookings: list } } })
const run = (input: unknown = enquiry, auth = request()) => createPortalPageStudioBooking(auth, input, { query, now: () => new Date(timestamp) })
beforeEach(() => {
  vi.resetAllMocks()
  query.mockResolvedValue(structuredClone(row))
  read.mockResolvedValue(null)
  create.mockImplementation(async (_scope, booking) => ({ booking, version: 0, processedCommands: [] }))
  list.mockResolvedValue([structuredClone(aggregate)])
})
describe('authenticated client staff booking intake', () => {
  it('derives identity, timestamp and full scope on the server and projects no provider authority', async () => {
    const result = await run()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE site.client_id = $1 AND site.id = $2'), [clientId, siteId, userId])
    expect(create).toHaveBeenCalledWith(scope, aggregate.booking, requestKey)
    expect(result).toMatchObject({ booking: { id, createdAt: timestamp, status: 'enquiry', version: 0 }, replayed: false })
    expect(result.booking).not.toHaveProperty('scope')
    expect(result.booking).not.toHaveProperty('processedCommands')
  })
  it('replays an immutable enquiry after an operator decision, preserving original timestamps and current state', async () => {
    const saved = { ...structuredClone(aggregate), version: 2, processedCommands: ['operator-decision'], booking: { ...aggregate.booking, createdAt: '2026-09-13T00:00:00Z', requestedAt: '2026-09-13T00:00:00Z', status: 'approved', quote: { amountCents: 25000, currency: 'AUD', expiresAt: '2026-10-01T00:00:00Z', version: 1 }, vehicleId: 'vehicle-1' } }
    read.mockResolvedValue(saved)
    expect(await run()).toMatchObject({ booking: { id, createdAt: saved.booking.createdAt, quote: saved.booking.quote, vehicleId: 'vehicle-1', version: 2, status: 'approved' }, replayed: true })
    expect(create).not.toHaveBeenCalled()
  })
  it.each([
    { customer: { ...enquiry.customer, name: 'Other' } }, { customer: { ...enquiry.customer, email: 'other@example.invalid' } },
    { customer: { ...enquiry.customer, phone: '0500000000' } }, { pickup: 'C' }, { dropoff: 'C' },
    { travelAt: '2026-12-02T00:00:00.000Z' }, { durationMinutes: 90 }, { passengers: 3 }, { occasion: 'Wedding' }
  ])('rejects reusing a key for different immutable fields: %j', async (change) => {
    read.mockResolvedValue(aggregate)
    await expect(run({ ...enquiry, ...change })).rejects.toMatchObject({ code: 'BOOKING_REQUEST_CONFLICT', statusCode: 409 })
    expect(create).not.toHaveBeenCalled()
  })
  it('reconciles simultaneous identical requests after the insert winner persists', async () => {
    let saved: typeof aggregate | null = null
    let reads = 0
    read.mockImplementation(async () => ++reads <= 2 ? null : saved)
    create.mockImplementation(async (_scope, booking) => {
      if (saved) throw new Error('unique constraint internal')
      saved = { booking, version: 0, processedCommands: [] }
      return saved
    })
    const results = await Promise.all([run(), run()])
    expect(results.map(value => value.replayed).sort()).toEqual([false, true])
    expect(results[0]!.booking).toEqual(results[1]!.booking)
  })
  it('reconciles a lost acknowledgement only when the persisted enquiry matches', async () => {
    read.mockResolvedValueOnce(null).mockResolvedValueOnce(aggregate)
    create.mockRejectedValue(new Error('private provider information'))
    await expect(run()).resolves.toMatchObject({ replayed: true, booking: { id } })
  })
  it('rejects the loser when concurrent requests reuse a key with different details', async () => {
    let saved: typeof aggregate | null = null
    let reads = 0
    read.mockImplementation(async () => ++reads <= 2 ? null : saved)
    create.mockImplementation(async (_scope, booking) => {
      if (saved) throw new Error('unique constraint internal')
      saved = { booking, version: 0, processedCommands: [] }
      return saved
    })
    const results = await Promise.allSettled([run(), run({ ...enquiry, pickup: 'Different pickup' })])
    expect(results[0]).toMatchObject({ status: 'fulfilled' })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'BOOKING_REQUEST_CONFLICT', statusCode: 409 } })
  })
  it.each([undefined, '', 'preview'])('denies writes without a declared runtime environment %s', async (environment) => {
    const auth = request()
    auth.env.PAGE_STUDIO_CONTENT_ENVIRONMENT = environment
    await expect(run(enquiry, auth)).rejects.toMatchObject({ code: 'BOOKINGS_UNAVAILABLE', statusCode: 503 })
    expect(read).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it('never acknowledges a failed RPC without a matching persisted row', async () => {
    create.mockRejectedValue(new Error('private provider information'))
    await expect(run()).rejects.toMatchObject({ code: 'BOOKINGS_FAILED', statusCode: 502 })
    read.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...aggregate, booking: { ...aggregate.booking, pickup: 'collision' } })
    await expect(run()).rejects.toMatchObject({ code: 'BOOKING_REQUEST_CONFLICT', statusCode: 409 })
    read.mockRejectedValue(new Error('private provider information'))
    await expect(run()).rejects.toMatchObject({ message: expect.not.stringContaining('private provider') })
  })
  it('creates separate IDs for distinct request keys and canonicalizes UUID case', async () => {
    await run()
    await run({ ...enquiry, requestKey: '20000000-0000-4000-8000-000000000002' })
    expect(create.mock.calls[0]![1].id).not.toEqual(create.mock.calls[1]![1].id)
    await run({ ...enquiry, requestKey: 'ABCDEFAB-0000-4000-8000-000000000002' })
    expect(create.mock.calls[2]![1].id).toBe('portal-abcdefab-0000-4000-8000-000000000002')
  })
  it.each(['scope', 'bookingId', 'createdAt', 'status', 'quote', 'vehicleId'])('rejects client-controlled authority %s', async (field) => {
    await expect(run({ ...enquiry, [field]: 'forged' })).rejects.toMatchObject({ statusCode: 400 })
    expect(query).not.toHaveBeenCalled()
  })
  it.each(['viewer', 'guest', 'editor', 'agency', ''])('denies intake for unauthorized portal role %s', async (role) => {
    const auth = request()
    auth.actor.role = role
    await expect(run(enquiry, auth)).rejects.toMatchObject({ statusCode: 403 })
    expect(query).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it.each([null, { ...row, client_id: 'foreign' }, { ...row, site_id: 'foreign' }, { ...row, user_id: 'foreign' }])('denies a missing or foreign membership %j', async (value) => {
    query.mockResolvedValue(value)
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
    expect(read).not.toHaveBeenCalled()
  })
  it.each([{ membership_role: 'viewer' }, { user_role: 'viewer' }, { user_role: 'guest' }, { site_status: 'archived' }, { entitlement_status: 'cancelled' }, { entitlement_effective: false }, { plan_metadata: { allowedModules: [] } }])('rechecks editing and entitlement on each retry: %j', async (value) => {
    query.mockResolvedValue({ ...row, ...value })
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    expect(read).not.toHaveBeenCalled()
  })
  it.each(['tenantId', 'clientId', 'businessId', 'siteId', 'environment'])('rejects a returned aggregate with foreign %s', async (axis) => {
    read.mockResolvedValue({ ...aggregate, booking: { ...aggregate.booking, scope: { ...scope, [axis]: axis === 'environment' ? 'production' : 'foreign' } } })
    await expect(run()).rejects.toMatchObject({ code: 'BOOKING_RESPONSE_INVALID' })
  })
  it('rejects wrong-ID collisions and unverified successful RPC receipts without fallback acknowledgement', async () => {
    read.mockResolvedValue({ ...aggregate, booking: { ...aggregate.booking, id: 'collision' } })
    await expect(run()).rejects.toMatchObject({ code: 'BOOKING_RESPONSE_INVALID' })
    read.mockResolvedValue(null)
    create.mockResolvedValue({ ...aggregate, version: 1 })
    await expect(run()).rejects.toMatchObject({ code: 'BOOKING_RESPONSE_INVALID' })
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('allows viewer list access, validates response filters and hides routing fields', async () => {
    const auth = request()
    auth.actor.role = 'viewer'
    query.mockResolvedValue({ ...row, user_role: 'viewer', membership_role: 'viewer' })
    const result = await listPortalPageStudioBookings(auth, { limit: 10 }, { query })
    expect(result[0]).toMatchObject({ id })
    expect(result[0]).not.toHaveProperty('scope')
    list.mockResolvedValue([aggregate, aggregate])
    await expect(listPortalPageStudioBookings(auth, { limit: 10 }, { query })).rejects.toMatchObject({ statusCode: 502 })
    await expect(listPortalPageStudioBookings(auth, { limit: 1 }, { query })).rejects.toMatchObject({ statusCode: 502 })
    list.mockResolvedValue([aggregate])
    await expect(listPortalPageStudioBookings(auth, { limit: 10, status: 'approved' }, { query })).rejects.toMatchObject({ statusCode: 502 })
  })
})
