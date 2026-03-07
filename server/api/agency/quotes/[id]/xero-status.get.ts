/**
 * Sync and return Xero status for a quote.
 * GET /api/agency/quotes/:id/xero-status
 */

import { requirePricingAccess } from '~~/server/utils/auth'
import { syncQuoteStatus } from '~~/server/utils/xeroQuoteWriter'

export default defineEventHandler(async (event) => {
  await requirePricingAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote ID is required' })
  }

  try {
    const result = await syncQuoteStatus(event, id)

    return {
      success: true,
      xeroStatus: result.xeroStatus,
      syncedAt: result.syncedAt,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Xero] Sync quote status failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to sync quote status from Xero'
    })
  }
})
