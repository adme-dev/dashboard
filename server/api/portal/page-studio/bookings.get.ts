import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listPortalPageStudioBookings } from '~~/server/utils/pageStudio/portalBookings'
import { PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const parsed = PageStudioBookingFiltersSchema.safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Select a website and valid booking filters' })
    const { siteId, ...filters } = parsed.data
    const bookings = await listPortalPageStudioBookings({ actor: { userId: user.id, clientId: user.clientId, role: user.role }, siteId, env: event.context.cloudflare?.env ?? {} }, filters)
    return { siteId, bookings }
  } catch (error) { pageStudioHttpError(error) }
})
