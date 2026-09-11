import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { createScopedPageStudioBooking } from '~~/server/utils/pageStudio/bookingsBinding'
import { PageStudioBookingEnquirySchema, PageStudioBookingFiltersSchema } from '~~/shared/pageStudio/bookings'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const parsed = PageStudioBookingEnquirySchema.safeParse(await readBody(event))
    const query = PageStudioBookingFiltersSchema.pick({ siteId: true }).safeParse(getQuery(event))
    const token = getHeader(event, 'x-turnstile-token')
    if (!parsed.success || !query.success || !token || token.length > 2048) throw createError({ statusCode: 400, statusMessage: 'Invalid booking enquiry or website' })
    if (!isTurnstileEnabled()) throw createError({ statusCode: 503, statusMessage: 'Booking security is not configured' })
    const ip = getHeader(event, 'cf-connecting-ip')
    if (!await verifyTurnstile(token, ip)) throw createError({ statusCode: 403, statusMessage: 'Booking captcha verification failed' })
    const booking = await createScopedPageStudioBooking({ actor: { role: 'client', actorId: user.id, clientId: user.clientId }, siteId: query.data.siteId, env: event.context.cloudflare?.env ?? {} }, parsed.data)
    return { booking }
  } catch (error) { pageStudioHttpError(error) }
})
