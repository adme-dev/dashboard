import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { getAudienceCohortPreview } from '~~/server/utils/persona/cohorts'

const Query = z.object({
  clientId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  platform: z.string().trim().max(64).optional()
})

export default defineEventHandler(async event => {
  await requireAuth(event)
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid cohort filters' })
  }
  const { clientId, ...filters } = parsed.data
  try {
    return await getAudienceCohortPreview(clientId, filters)
  } catch (error) {
    if (error instanceof Error && error.message === 'startDate must not be after endDate') {
      throw createError({ statusCode: 422, statusMessage: error.message })
    }
    throw error
  }
})
