/**
 * Convert an accepted Xero quote to a DRAFT invoice.
 * POST /api/agency/quotes/:id/xero-to-invoice
 */

import { requirePricingAccess } from '~~/server/utils/auth'
import { convertXeroQuoteToInvoice } from '~~/server/utils/xeroQuoteWriter'

export default defineEventHandler(async (event) => {
  await requirePricingAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote ID is required' })
  }

  try {
    const result = await convertXeroQuoteToInvoice(event, id)

    return {
      success: true,
      xeroInvoiceId: result.xeroInvoiceId,
      xeroInvoiceNumber: result.xeroInvoiceNumber,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Xero] Convert quote to invoice failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to convert Xero quote to invoice'
    })
  }
})
