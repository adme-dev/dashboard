import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { createScopedPageStudioBooking, type PageStudioBookingsBinding } from '~~/server/utils/pageStudio/bookingsBinding'
import { z } from 'zod'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'

const Body = z.object({
  bookingId: z.string().trim().min(1).max(128), requestKey: z.string().trim().min(1).max(128),
  customer: z.object({ name: z.string().trim().min(1).max(120), email: z.string().email(), phone: z.string().trim().min(6).max(40) }).strict(),
  pickup: z.string().trim().min(1).max(240), dropoff: z.string().trim().min(1).max(240),
  travelAt: z.string().datetime(), durationMinutes: z.number().int().min(1).max(2880), passengers: z.number().int().min(1).max(500), occasion: z.string().trim().max(160), vehicleId: z.string().trim().min(1).max(128).nullable().default(null)
}).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const parsed = Body.safeParse(await readBody(event))
    const turnstileToken = getHeader(event, 'x-turnstile-token')
    if (!parsed.success || !turnstileToken || turnstileToken.length > 2048) throw createError({ statusCode: 400, statusMessage: 'Invalid booking enquiry' })
    if (isTurnstileEnabled()) {
      const ip = getHeader(event, 'cf-connecting-ip') || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
      if (!await verifyTurnstile(turnstileToken, ip)) throw createError({ statusCode: 403, statusMessage: 'Booking captcha verification failed' })
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_BOOKINGS as PageStudioBookingsBinding | undefined
    const booking = await createScopedPageStudioBooking(binding, {
      ...parsed.data,
      scope: { businessId: user.clientId, clientId: user.clientId, environment: 'production', siteId: 'portal', tenantId: user.clientId },
      status: 'enquiry', quote: null, createdAt: new Date().toISOString(), requestedAt: new Date().toISOString()
    }, parsed.data.requestKey)
    return { booking }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
