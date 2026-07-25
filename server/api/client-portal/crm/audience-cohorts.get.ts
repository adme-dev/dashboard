import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getAudienceCohortPreview } from '~~/server/utils/persona/cohorts'

const Query = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  platform: z.string().trim().max(64).optional()
})

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (client.leadCaptureMode !== 'full_crm') {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      minAudienceSize: 1000,
      filters: {},
      cohorts: []
    }
  }
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid cohort filters' })
  }
  try {
    return await getAudienceCohortPreview(client.clientId, parsed.data)
  } catch (error) {
    if (error instanceof Error && error.message === 'startDate must not be after endDate') {
      throw createError({ statusCode: 422, statusMessage: error.message })
    }
    throw error
  }
})
