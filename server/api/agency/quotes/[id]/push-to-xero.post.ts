/**
 * Push an internal quote to Xero as a DRAFT quote.
 * POST /api/agency/quotes/:id/push-to-xero
 */

import { requirePricingAccess } from '~~/server/utils/auth'
import { pushQuoteToXero } from '~~/server/utils/xeroQuoteWriter'

export default defineEventHandler(async (event) => {
  await requirePricingAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote ID is required' })
  }

  try {
    const result = await pushQuoteToXero(event, id)

    return {
      success: true,
      xeroQuoteId: result.xeroQuoteId,
      xeroQuoteNumber: result.xeroQuoteNumber,
      xeroStatus: result.xeroStatus,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Xero] Push quote failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to push quote to Xero'
    })
  }
})
