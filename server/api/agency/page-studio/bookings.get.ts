import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings, type PageStudioBookingsBinding } from '~~/server/utils/pageStudio/bookingsBinding'
import { z } from 'zod'

const Query = z.object({ status: z.string().trim().min(1).max(32).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid booking filters' })
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_BOOKINGS as PageStudioBookingsBinding | undefined
    const aggregates = await listScopedPageStudioBookings(binding, parsed.data)
    const bookings = aggregates.map((aggregate: unknown) => {
      const record = aggregate && typeof aggregate === 'object' ? aggregate as Record<string, unknown> : {}
      const nested = record.booking && typeof record.booking === 'object' ? record.booking as Record<string, unknown> : record
      const booking = nested
      return {
        id: booking.id,
        version: typeof record.version === 'number' ? record.version : 0,
        status: booking.status,
        customerName: booking.customer?.name ?? booking.customerName ?? null,
        pickupAt: booking.trip?.pickupAt ?? booking.pickupAt ?? null,
        pickupLocation: booking.trip?.pickupLocation ?? booking.pickupLocation ?? null,
        dropoffLocation: booking.trip?.dropoffLocation ?? booking.dropoffLocation ?? null,
        currency: booking.quote?.currency ?? null,
        quoteAmountMinor: booking.quote?.amountMinor ?? null
      }
    })
    return { tenantId, bookings }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
