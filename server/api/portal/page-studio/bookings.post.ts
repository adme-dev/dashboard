import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { createPortalPageStudioBooking } from '~~/server/utils/pageStudio/portalBookings'
import { PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const query = PageStudioBookingFiltersSchema.pick({ siteId: true }).safeParse(getQuery(event))
    if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Select a website for this booking enquiry' })
    return await createPortalPageStudioBooking({ actor: { userId: user.id, clientId: user.clientId, role: user.role }, siteId: query.data.siteId, env: event.context.cloudflare?.env ?? {} }, await readBody(event))
  } catch (error) { pageStudioHttpError(error) }
})
