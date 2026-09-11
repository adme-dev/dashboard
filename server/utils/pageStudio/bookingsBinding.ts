import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { hasPageStudioBookingEntitlement } from '~~/server/utils/pageStudio/bookingEntitlement'
import { PageStudioContentScopeSchema, samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { PageStudioBookingAggregateSchema, PageStudioBookingCommandSchema, PageStudioBookingEnquirySchema, PageStudioBookingStatusSchema } from '~~/shared/pageStudio/bookings'

export interface PageStudioBookingsBinding {
  listScopedBookings: (scope: PageStudioContentScope, options: { status?: string, limit: number }) => Promise<unknown>
  readScopedBooking: (scope: PageStudioContentScope, bookingId: string) => Promise<unknown>
  applyScopedBookingCommand: (scope: PageStudioContentScope, actor: 'operator', bookingId: string, command: unknown) => Promise<unknown>
  createScopedBooking: (scope: PageStudioContentScope, booking: unknown, requestKey: string) => Promise<unknown>
}
export type PageStudioBookingActor = { actorId: string } & (
  | { role: 'agency', tenantId: string, canApprove: boolean }
  | { role: 'client', clientId: string }
)
export interface PageStudioBookingRequest { actor: PageStudioBookingActor, siteId: string, env: Record<string, unknown> }
interface ScopeRow { tenant_id: string, client_id: string, site_status: string, entitlement_status: string, entitlement_effective: boolean, membership_role?: string | null, plan_metadata: unknown }
interface Dependencies { query?: (sql: string, params: unknown[]) => Promise<ScopeRow | null> }
export class PageStudioBookingsError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioBookingsError'
  }
}
const fail = (code: string, message: string, statusCode: number) => new PageStudioBookingsError(code, message, statusCode)
const unavailable = () => fail('BOOKINGS_UNAVAILABLE', 'Booking service is not configured for this website', 503)
const Bindings = z.array(z.object({ scope: PageStudioContentScopeSchema, bindingName: z.string().regex(/^[A-Z][A-Z0-9_]{2,80}$/), entrypoint: z.literal('ScopedBookingsEntrypoint') }).strict()).max(500)

async function authorise(request: PageStudioBookingRequest, writing: boolean, dependencies: Dependencies) {
  const { actor, siteId, env } = request
  if (!z.string().uuid().safeParse(siteId).success) throw fail('INVALID_SITE', 'Select a website for bookings', 400)
  const portal = actor.role === 'client'
  const query = dependencies.query ?? ((sql, params) => queryOneFresh<ScopeRow>(sql, params))
  const row = await query(`
    SELECT site.tenant_id, site.client_id, site.status AS site_status,
           entitlement.status AS entitlement_status, entitlement.plan_metadata,
           (entitlement.effective_from <= NOW() AND
            (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS entitlement_effective
           ${portal
              ? `, (SELECT membership.role FROM page_studio_site_memberships membership
             WHERE membership.tenant_id = site.tenant_id AND membership.client_id = site.client_id
               AND membership.site_id = site.id AND membership.user_id = $3) AS membership_role`
              : ''}
      FROM page_studio_sites site
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
       AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
     WHERE site.${portal ? 'client_id' : 'tenant_id'} = $1 AND site.id = $2
       ${portal
          ? ''
          : `AND site.tenant_id = (SELECT tenant_id FROM xero_org_connection
         WHERE tenant_id <> '__default__' ORDER BY updated_at DESC, tenant_id LIMIT 1)`}`,
  portal ? [actor.clientId, siteId, actor.actorId] : [actor.tenantId, siteId])
  if (!row) throw fail('BOOKING_SITE_NOT_FOUND', 'Website not found', 404)
  if (!hasPageStudioBookingEntitlement({ siteStatus: row.site_status, entitlementStatus: row.entitlement_status, effective: row.entitlement_effective, planMetadata: row.plan_metadata })
    || (portal && !(writing ? ['editor'] : ['editor', 'viewer']).includes(row.membership_role ?? ''))
    || (writing && actor.role === 'agency' && !actor.canApprove)) {
    throw fail('BOOKING_ACCESS_DENIED', 'Booking access denied', 403)
  }
  let bindings: z.infer<typeof Bindings>
  let environment: PageStudioContentScope['environment']
  try {
    if (typeof env.PAGE_STUDIO_BOOKING_BINDINGS !== 'string' || env.PAGE_STUDIO_BOOKING_BINDINGS.length > 250_000) throw unavailable()
    bindings = Bindings.parse(JSON.parse(env.PAGE_STUDIO_BOOKING_BINDINGS))
    environment = z.enum(['preview', 'staging', 'production']).parse(env.PAGE_STUDIO_BOOKING_ENVIRONMENT)
  } catch { throw unavailable() }
  const matches = bindings.filter(entry => entry.scope.tenantId === row.tenant_id && entry.scope.clientId === row.client_id && entry.scope.siteId === siteId && entry.scope.environment === environment)
  if (matches.length !== 1) throw unavailable()
  const selected = matches[0]!
  const service = Object.hasOwn(env, selected.bindingName) ? env[selected.bindingName] : null
  if (!service || typeof service !== 'object'
    || !['listScopedBookings', 'readScopedBooking', 'createScopedBooking', 'applyScopedBookingCommand'].every(method => typeof (service as Record<string, unknown>)[method] === 'function')) throw unavailable()
  return { scope: selected.scope, service: service as PageStudioBookingsBinding }
}
function decode(value: unknown, scope: PageStudioContentScope, bookingId?: string) {
  const parsed = PageStudioBookingAggregateSchema.safeParse(value)
  if (!parsed.success || !samePageStudioContentScope(parsed.data.booking.scope, scope) || (bookingId && parsed.data.booking.id !== bookingId)) {
    throw fail('BOOKING_RESPONSE_INVALID', 'Booking response could not be verified', 502)
  }
  return parsed.data
}
async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    throw fail('BOOKINGS_FAILED', 'Booking service is unavailable', 502)
  }
}
export async function listScopedPageStudioBookings(request: PageStudioBookingRequest, options: { status?: string, limit: number }, dependencies: Dependencies = {}) {
  const { scope, service } = await authorise(request, false, dependencies)
  const parsed = z.object({ status: PageStudioBookingStatusSchema.optional(), limit: z.number().int().min(1).max(100) }).strict().safeParse(options)
  if (!parsed.success) throw fail('INVALID_BOOKING_FILTERS', 'Invalid booking filters', 400)
  const result = await call(() => service.listScopedBookings(scope, parsed.data))
  if (!Array.isArray(result) || result.length > parsed.data.limit) throw fail('BOOKING_RESPONSE_INVALID', 'Booking response could not be verified', 502)
  return result.map(value => decode(value, scope))
}
export async function applyScopedPageStudioBooking(request: PageStudioBookingRequest, bookingId: string, input: unknown, dependencies: Dependencies = {}) {
  if (request.actor.role !== 'agency' || !request.actor.canApprove) throw fail('BOOKING_ACCESS_DENIED', 'Only booking operators can change bookings', 403)
  const { scope, service } = await authorise(request, true, dependencies)
  const parsed = PageStudioBookingCommandSchema.safeParse(input)
  if (!parsed.success || parsed.data.bookingId !== bookingId) throw fail('INVALID_BOOKING_COMMAND', 'Invalid booking command', 400)
  const { bookingId: _bookingId, ...command } = parsed.data
  const response = await call(() => service.applyScopedBookingCommand(scope, 'operator', bookingId, command))
  if (!response || typeof response !== 'object' || !('aggregate' in response)) throw fail('BOOKING_RESPONSE_INVALID', 'Booking response could not be verified', 502)
  return { aggregate: decode(response.aggregate, scope, bookingId) }
}
export async function createScopedPageStudioBooking(request: PageStudioBookingRequest, input: unknown, dependencies: Dependencies = {}) {
  const { scope, service } = await authorise(request, true, dependencies)
  const parsed = PageStudioBookingEnquirySchema.safeParse(input)
  if (!parsed.success) throw fail('INVALID_BOOKING_ENQUIRY', 'Invalid booking enquiry', 400)
  const { bookingId, requestKey, vehicleId: _vehicleId, ...trip } = parsed.data
  const now = new Date().toISOString()
  const booking = { ...trip, id: bookingId, scope, status: 'enquiry', quote: null, vehicleId: null, createdAt: now, requestedAt: now }
  return decode(await call(() => service.createScopedBooking(scope, booking, requestKey)), scope, bookingId)
}
