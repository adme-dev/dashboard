import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { applyScopedPageStudioBooking } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioBookingCommandSchema, PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const bookingId = getRouterParam(event, 'bookingId')
    const parsed = PageStudioBookingCommandSchema.safeParse(await readBody(event))
    const query = PageStudioBookingFiltersSchema.pick({ siteId: true }).safeParse(getQuery(event))
    if (!bookingId || !parsed.success || !query.success || parsed.data.bookingId !== bookingId) throw createError({ statusCode: 400, statusMessage: 'Invalid booking command or website' })
    const booking = await applyScopedPageStudioBooking({ actor: { role: 'agency', actorId: user.id, tenantId, canApprove: true }, siteId: query.data.siteId, env: event.context.cloudflare?.env ?? {} }, bookingId, parsed.data)
    return { actorId: user.id, booking }
  } catch (error) { pageStudioHttpError(error) }
})
