import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings, type PageStudioBookingsBinding } from '~~/server/utils/pageStudio/bookingsBinding'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_BOOKINGS as PageStudioBookingsBinding | undefined
    const aggregates = (await Promise.all([
      listScopedPageStudioBookings(binding, { limit: 100, status: 'approved' }),
      listScopedPageStudioBookings(binding, { limit: 100, status: 'customer-confirmed' })
    ])).flat()
    const bookings = aggregates.map((aggregate: unknown) => {
      const record = aggregate && typeof aggregate === 'object' ? aggregate as Record<string, unknown> : {}
      const booking = record.booking && typeof record.booking === 'object' ? record.booking as Record<string, unknown> : record
      const customer = booking.customer && typeof booking.customer === 'object' ? booking.customer as Record<string, unknown> : {}
      const trip = booking.trip && typeof booking.trip === 'object' ? booking.trip as Record<string, unknown> : {}
      return {
        id: String(booking.id ?? ''),
        customer: String(customer.name ?? '—'),
        phone: String(customer.phone ?? '—'),
        passengers: Number(booking.passengers ?? trip.passengers ?? 0),
        pickup: String(booking.pickup ?? trip.pickupLocation ?? '—'),
        dropoff: String(booking.dropoff ?? trip.dropoffLocation ?? '—'),
        travelAt: typeof booking.travelAt === 'string' ? booking.travelAt : typeof trip.pickupAt === 'string' ? trip.pickupAt : null,
        durationMinutes: Number(booking.durationMinutes ?? trip.durationMinutes ?? 0),
        vehicleId: String(booking.vehicleId ?? 'Unassigned'),
        occasion: String(booking.occasion ?? '—')
      }
    })
    return { tenantId, bookings }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
