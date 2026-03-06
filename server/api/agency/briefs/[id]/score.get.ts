/**
 * Get brief completeness score
 */

import { requireAuth } from '~~/server/utils/auth'
import { scoreBriefCompleteness } from '~~/server/utils/aiBriefScoring'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  try {
    return await scoreBriefCompleteness(id)
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to score brief:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to score brief completeness' })
  }
})
