import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const parsed = PageStudioBookingFiltersSchema.pick({ siteId: true }).safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Select a website for the driver sheet' })
    const request = { actor: { role: 'agency' as const, actorId: user.id, tenantId, canApprove: false }, siteId: parsed.data.siteId, env: event.context.cloudflare?.env ?? {} }
    const aggregates = (await Promise.all([
      listScopedPageStudioBookings(request, { limit: 100, status: 'approved' }),
      listScopedPageStudioBookings(request, { limit: 100, status: 'customer-confirmed' })
    ])).flat()
    const bookings = aggregates.map(({ booking }) => ({
      id: booking.id, customer: booking.customer.name, phone: booking.customer.phone,
      passengers: booking.passengers, pickup: booking.pickup, dropoff: booking.dropoff,
      travelAt: booking.travelAt, durationMinutes: booking.durationMinutes,
      vehicleId: booking.vehicleId ?? 'Unassigned', occasion: booking.occasion
    }))
    return { tenantId, siteId: request.siteId, bookings }
  } catch (error) { pageStudioHttpError(error) }
})
