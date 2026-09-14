import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { hasPageStudioBookingEntitlement } from '~~/server/utils/pageStudio/bookingEntitlement'
import { PageStudioContentScopeSchema, samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { PageStudioBookingAggregateSchema, PageStudioBookingCommandSchema, PageStudioBookingStatusSchema } from '~~/shared/pageStudio/bookings'

export interface PageStudioBookingsBinding {
  listScopedBookings: (scope: PageStudioContentScope, options: { status?: string, limit: number }) => Promise<unknown>
  applyScopedBookingCommand: (scope: PageStudioContentScope, actor: 'operator', bookingId: string, command: unknown) => Promise<unknown>
}
export interface PageStudioBookingRequest {
  actor: { role: 'agency', actorId: string, tenantId: string, canApprove: boolean }
  siteId: string
  env: Record<string, unknown>
}
interface ScopeRow { tenant_id: string, client_id: string, site_status: string, entitlement_status: string, entitlement_effective: boolean, plan_metadata: unknown }
interface Dependencies { query?: (sql: string, params: unknown[]) => Promise<ScopeRow | null> }
export class PageStudioBookingsError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioBookingsError'
  }
}
const fail = (code: string, message: string, statusCode: number) => new PageStudioBookingsError(code, message, statusCode)
const invalidResponse = () => fail('BOOKING_RESPONSE_INVALID', 'Booking response could not be verified', 502)

async function authorise(request: PageStudioBookingRequest, writing: boolean, dependencies: Dependencies) {
  const { actor, siteId, env } = request
  if (!z.string().uuid().safeParse(siteId).success) throw fail('INVALID_SITE', 'Select a website for bookings', 400)
  if (actor.role !== 'agency' || !actor.actorId || !actor.tenantId || (writing && !actor.canApprove)) {
    throw fail('BOOKING_ACCESS_DENIED', 'Booking operator access required', 403)
  }
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<ScopeRow>(sql, params))
  const row = await query(`
    SELECT site.tenant_id, site.client_id, site.status AS site_status,
           entitlement.status AS entitlement_status, entitlement.plan_metadata,
           (entitlement.effective_from <= NOW() AND
            (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
      FROM page_studio_sites site
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
       AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
     WHERE site.tenant_id = $1 AND site.id = $2`, [actor.tenantId, siteId])
  if (!row || row.tenant_id !== actor.tenantId) throw fail('BOOKING_SITE_NOT_FOUND', 'Website not found', 404)
  if (!hasPageStudioBookingEntitlement({ siteStatus: row.site_status, entitlementStatus: row.entitlement_status, effective: row.entitlement_effective, planMetadata: row.plan_metadata })) {
    throw fail('BOOKING_ACCESS_DENIED', 'This website does not have active booking access', 403)
  }
  const environment = env.PAGE_STUDIO_CONTENT_ENVIRONMENT
  const service = env.PAGE_STUDIO_CONTENT_ROUTER as PageStudioBookingsBinding | undefined
  if ((environment !== 'staging' && environment !== 'production')
    || typeof service?.listScopedBookings !== 'function' || typeof service?.applyScopedBookingCommand !== 'function') {
    throw fail('BOOKINGS_UNAVAILABLE', 'Bookings are not connected for this environment', 503)
  }
  // Provisioning uses the client as the business ID. The private router resolves
  // the active site on every call, without a browser-selected script or static mapping.
  const scope = PageStudioContentScopeSchema.parse({ businessId: row.client_id, clientId: row.client_id, tenantId: row.tenant_id, siteId, environment })
  return { scope, service }
}
function decode(value: unknown, scope: PageStudioContentScope, bookingId?: string) {
  const parsed = PageStudioBookingAggregateSchema.safeParse(value)
  if (!parsed.success || !samePageStudioContentScope(parsed.data.booking.scope, scope) || (bookingId && parsed.data.booking.id !== bookingId)) throw invalidResponse()
  return parsed.data
}
async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    throw fail('BOOKINGS_FAILED', 'Booking could not be verified. Refresh to check its latest status before retrying.', 502)
  }
}
export async function listScopedPageStudioBookings(request: PageStudioBookingRequest, options: { status?: string, limit: number }, dependencies: Dependencies = {}) {
  const parsed = z.object({ status: PageStudioBookingStatusSchema.optional(), limit: z.number().int().min(1).max(100) }).strict().safeParse(options)
  if (!parsed.success) throw fail('INVALID_BOOKING_FILTERS', 'Invalid booking filters', 400)
  const { scope, service } = await authorise(request, false, dependencies)
  const result = await call(() => service.listScopedBookings(scope, parsed.data))
  if (!Array.isArray(result) || result.length > parsed.data.limit) throw invalidResponse()
  const bookings = result.map(value => decode(value, scope))
  if (new Set(bookings.map(item => item.booking.id)).size !== bookings.length
    || (parsed.data.status && bookings.some(item => item.booking.status !== parsed.data.status))) throw invalidResponse()
  return bookings
}
export async function applyScopedPageStudioBooking(request: PageStudioBookingRequest, bookingId: string, input: unknown, dependencies: Dependencies = {}) {
  const parsed = PageStudioBookingCommandSchema.safeParse(input)
  if (!parsed.success || parsed.data.bookingId !== bookingId) throw fail('INVALID_BOOKING_COMMAND', 'Invalid booking command', 400)
  const { scope, service } = await authorise(request, true, dependencies)
  const { bookingId: _bookingId, ...command } = parsed.data
  const response = await call(() => service.applyScopedBookingCommand(scope, 'operator', bookingId, command))
  if (!response || typeof response !== 'object' || !('aggregate' in response)) throw invalidResponse()
  const aggregate = decode(response.aggregate, scope, bookingId)
  if (!aggregate.processedCommands.includes(command.idempotencyKey) || aggregate.version <= command.expectedVersion) throw invalidResponse()
  return { aggregate }
}
