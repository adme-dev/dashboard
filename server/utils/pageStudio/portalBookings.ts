import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { hasPageStudioBookingEntitlement } from '~~/server/utils/pageStudio/bookingEntitlement'
import { PageStudioBookingsError } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioContentScopeSchema, samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { PageStudioBookingAggregateSchema, PageStudioBookingFiltersSchema, PageStudioPortalBookingEnquirySchema, type PageStudioBookingAggregate, type PageStudioPortalBookingEnquiry } from '~~/shared/pageStudio/bookings'

export interface PortalBookingRequest {
  actor: { userId: string, clientId: string, role: string }
  siteId: string
  env: Record<string, unknown>
}
interface ScopeRow {
  tenant_id: string
  client_id: string
  site_id: string
  user_id: string
  user_role: string
  membership_role: string
  site_status: string
  entitlement_status: string
  entitlement_effective: boolean
  plan_metadata: unknown
}
interface Dependencies {
  query?: (sql: string, params: unknown[]) => Promise<ScopeRow | null>
  now?: () => Date
}
interface Router {
  listScopedBookings: (scope: PageStudioContentScope, options: { status?: string, limit: number }) => Promise<unknown>
  readScopedBooking: (scope: PageStudioContentScope, bookingId: string) => Promise<unknown>
  createScopedBooking: (scope: PageStudioContentScope, booking: PageStudioBookingAggregate['booking'], requestKey: string) => Promise<unknown>
}
const fail = (code: string, message: string, statusCode: number) => new PageStudioBookingsError(code, message, statusCode)
const invalidResponse = () => fail('BOOKING_RESPONSE_INVALID', 'Booking response could not be verified', 502)
const unavailable = () => fail('BOOKINGS_FAILED', 'Booking could not be verified. Retry with the same request to check its saved status.', 502)

async function authorise(request: PortalBookingRequest, writing: boolean, dependencies: Dependencies) {
  const { actor, siteId, env } = request
  if (!z.string().uuid().safeParse(siteId).success) throw fail('INVALID_SITE', 'Select a website for bookings', 400)
  if (!actor.userId || !actor.clientId || !['admin', 'manager', 'viewer'].includes(actor.role)
    || (writing && !['admin', 'manager'].includes(actor.role))) throw fail('BOOKING_ACCESS_DENIED', 'Website booking access denied', 403)
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<ScopeRow>(sql, params))
  const row = await query(`
    SELECT site.tenant_id, site.client_id, site.id AS site_id,
           member.user_id, member.role AS membership_role, portal_user.role AS user_role,
           site.status AS site_status, entitlement.status AS entitlement_status, entitlement.plan_metadata,
           (entitlement.effective_from <= NOW() AND
            (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
      FROM page_studio_sites site
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_site_memberships member ON member.tenant_id = site.tenant_id
       AND member.client_id = site.client_id AND member.site_id = site.id AND member.user_id = $3
      JOIN client_users portal_user ON portal_user.id = member.user_id
       AND portal_user.client_id = site.client_id AND portal_user.status = 'active'
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
       AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
     WHERE site.client_id = $1 AND site.id = $2`, [actor.clientId, siteId, actor.userId])
  if (!row || row.client_id !== actor.clientId || row.site_id !== siteId || row.user_id !== actor.userId) {
    throw fail('BOOKING_SITE_NOT_FOUND', 'Website not found', 404)
  }
  if (!['admin', 'manager', 'viewer'].includes(row.user_role) || !['viewer', 'editor'].includes(row.membership_role)
    || (writing && (!['admin', 'manager'].includes(row.user_role) || row.membership_role !== 'editor'))
    || !hasPageStudioBookingEntitlement({ siteStatus: row.site_status, entitlementStatus: row.entitlement_status, effective: row.entitlement_effective, planMetadata: row.plan_metadata })) {
    throw fail('BOOKING_ACCESS_DENIED', 'This website does not have active booking access', 403)
  }
  const environment = env.PAGE_STUDIO_CONTENT_ENVIRONMENT
  const service = env.PAGE_STUDIO_CONTENT_ROUTER as Router | undefined
  if ((environment !== 'staging' && environment !== 'production') || typeof service?.listScopedBookings !== 'function'
    || (writing && (typeof service.readScopedBooking !== 'function' || typeof service.createScopedBooking !== 'function'))) {
    throw fail('BOOKINGS_UNAVAILABLE', 'Bookings are not connected for this environment', 503)
  }
  const scope = PageStudioContentScopeSchema.safeParse({ tenantId: row.tenant_id, clientId: row.client_id, businessId: row.client_id, siteId, environment })
  if (!scope.success) throw fail('BOOKINGS_UNAVAILABLE', 'Website booking scope is not configured', 503)
  const canCreate = ['admin', 'manager'].includes(actor.role)
    && ['admin', 'manager'].includes(row.user_role) && row.membership_role === 'editor'
  return { scope: scope.data, service, canCreate }
}

function decode(value: unknown, scope: PageStudioContentScope, id?: string) {
  const result = PageStudioBookingAggregateSchema.safeParse(value)
  if (!result.success || !samePageStudioContentScope(result.data.booking.scope, scope) || (id && result.data.booking.id !== id)) throw invalidResponse()
  return result.data
}

/** Provider routing identifiers and processed command receipts stay private. */
function project({ booking, version }: PageStudioBookingAggregate) {
  const { scope: _scope, ...fields } = booking
  return { ...fields, version }
}

function verifyEnquiry(aggregate: PageStudioBookingAggregate, enquiry: PageStudioPortalBookingEnquiry) {
  const booking = aggregate.booking
  if (booking.customer.name !== enquiry.customer.name || booking.customer.email !== enquiry.customer.email
    || booking.customer.phone !== enquiry.customer.phone || booking.pickup !== enquiry.pickup || booking.dropoff !== enquiry.dropoff
    || booking.travelAt !== enquiry.travelAt || booking.durationMinutes !== enquiry.durationMinutes
    || booking.passengers !== enquiry.passengers || booking.occasion !== enquiry.occasion) {
    throw fail('BOOKING_REQUEST_CONFLICT', 'This request was already used for a different booking enquiry', 409)
  }
  return project(aggregate)
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    throw unavailable()
  }
}

export async function listPortalPageStudioBookings(request: PortalBookingRequest, input: unknown, dependencies: Dependencies = {}) {
  const filters = PageStudioBookingFiltersSchema.omit({ siteId: true }).safeParse(input)
  if (!filters.success) throw fail('INVALID_BOOKING_FILTERS', 'Invalid booking filters', 400)
  const { scope, service, canCreate } = await authorise(request, false, dependencies)
  const result = await call(() => service.listScopedBookings(scope, filters.data))
  if (!Array.isArray(result) || result.length > filters.data.limit) throw invalidResponse()
  const aggregates = result.map(value => decode(value, scope))
  if (new Set(aggregates.map(value => value.booking.id)).size !== aggregates.length
    || (filters.data.status && aggregates.some(value => value.booking.status !== filters.data.status))) throw invalidResponse()
  return { bookings: aggregates.map(project), canCreate }
}

export async function createPortalPageStudioBooking(request: PortalBookingRequest, input: unknown, dependencies: Dependencies = {}) {
  const parsed = PageStudioPortalBookingEnquirySchema.safeParse(input)
  if (!parsed.success) throw fail('INVALID_BOOKING_ENQUIRY', 'Invalid booking enquiry', 400)
  const { scope, service } = await authorise(request, true, dependencies)
  const { requestKey, ...fields } = parsed.data
  // A separate caller-selected ID would permit the same key to refer to two IDs.
  // Scope supplies tenant/site isolation; this injective mapping supplies request identity.
  const id = `portal-${requestKey.toLowerCase()}`
  const existing = await call(() => service.readScopedBooking(scope, id))
  if (existing !== null) return { booking: verifyEnquiry(decode(existing, scope, id), parsed.data), replayed: true }
  const now = (dependencies.now?.() ?? new Date()).toISOString()
  const booking = { ...fields, id, scope, createdAt: now, requestedAt: now, status: 'enquiry' as const, quote: null, vehicleId: null }
  let result: unknown
  try {
    result = await service.createScopedBooking(scope, booking, requestKey.toLowerCase())
  } catch {
    // The write may have succeeded before a lost acknowledgement, or another
    // identical request won the insert race. Never acknowledge an unverified error.
    const saved = await call(() => service.readScopedBooking(scope, id))
    if (saved === null) throw unavailable()
    return { booking: verifyEnquiry(decode(saved, scope, id), parsed.data), replayed: true }
  }
  const aggregate = decode(result, scope, id)
  if (aggregate.version !== 0 || aggregate.booking.status !== 'enquiry' || aggregate.booking.quote !== null
    || aggregate.booking.vehicleId !== null || aggregate.booking.createdAt !== now || aggregate.booking.requestedAt !== now
    || aggregate.processedCommands.length !== 0) throw invalidResponse()
  return { booking: verifyEnquiry(aggregate, parsed.data), replayed: false }
}
