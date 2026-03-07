/**
 * Generate an internal quote from an approved brief using rate card pricing.
 * POST /api/agency/briefs/:id/generate-quote
 */

import { requirePricingAccess } from '~~/server/utils/auth'
import { generateQuoteFromBrief } from '~~/server/utils/briefQuoteGenerator'

export default defineEventHandler(async (event) => {
  const user = await requirePricingAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  try {
    const result = await generateQuoteFromBrief(id, user.id)

    return {
      success: true,
      quoteId: result.quoteId,
      quoteNumber: result.quoteNumber,
      total: result.total,
      lineItemCount: result.lineItemCount,
      tasksLinked: result.tasksLinked,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Brief] Generate quote failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate quote from brief'
    })
  }
})
