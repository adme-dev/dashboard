import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { applyScopedPageStudioBooking, type PageStudioBookingsBinding } from '~~/server/utils/pageStudio/bookingsBinding'
import { z } from 'zod'

const Body = z.object({
  actor: z.literal('operator'),
  bookingId: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(128),
  nextStatus: z.enum(['enquiry', 'quoted', 'approved', 'rejected', 'cancelled', 'completed']),
  quote: z.object({
    amountCents: z.number().int().min(0).max(100_000_000), currency: z.string().regex(/^[A-Z]{3}$/), expiresAt: z.string().datetime(), version: z.number().int().min(1)
  }).strict().optional()
}).strict()

export default eventHandler(async (event) => {
  try {
    const { user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const bookingId = getRouterParam(event, 'bookingId')
    const parsed = Body.safeParse(await readBody(event))
    if (!bookingId || !parsed.success || parsed.data.bookingId !== bookingId) throw createError({ statusCode: 400, statusMessage: 'Invalid booking command' })
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_BOOKINGS as PageStudioBookingsBinding | undefined
    const command = { ...parsed.data, actor: 'operator' as const }
    const result = await applyScopedPageStudioBooking(binding, bookingId, command)
    return { actorId: user.id, booking: result }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
