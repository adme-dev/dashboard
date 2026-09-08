import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { listScopedPageStudioBookings, type PageStudioBookingsBinding } from '~~/server/utils/pageStudio/bookingsBinding'
import { z } from 'zod'

const Query = z.object({
  status: z.string().trim().min(1).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid booking filters' })
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_BOOKINGS as PageStudioBookingsBinding | undefined
    const bookings = await listScopedPageStudioBookings(binding, parsed.data)
    return { clientId: user.clientId, bookings }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
