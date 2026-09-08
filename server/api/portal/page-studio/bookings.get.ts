import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const parsed = PageStudioBookingFiltersSchema.safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Select a website and valid booking filters' })
    const { siteId, ...options } = parsed.data
    const bookings = await listScopedPageStudioBookings({ actor: { role: 'client', actorId: user.id, clientId: user.clientId }, siteId, env: event.context.cloudflare?.env ?? {} }, options)
    return { clientId: user.clientId, siteId, bookings }
  } catch (error) { pageStudioHttpError(error) }
})
