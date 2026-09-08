import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const parsed = PageStudioBookingFiltersSchema.safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Select a website and valid booking filters' })
    const { siteId, ...options } = parsed.data
    const aggregates = await listScopedPageStudioBookings({ actor: { role: 'agency', actorId: user.id, tenantId, canApprove: false }, siteId, env: event.context.cloudflare?.env ?? {} }, options)
    const bookings = aggregates.map(({ booking, version }) => ({
      id: booking.id, version, status: booking.status,
      customerName: booking.customer.name, pickupAt: booking.travelAt,
      pickupLocation: booking.pickup, dropoffLocation: booking.dropoff,
      vehicleId: booking.vehicleId, currency: booking.quote?.currency ?? null,
      quoteAmountCents: booking.quote?.amountCents ?? null,
      quoteExpiresAt: booking.quote?.expiresAt ?? null,
      quoteVersion: booking.quote?.version ?? null
    }))
    return { tenantId, siteId, bookings }
  } catch (error) { pageStudioHttpError(error) }
})
