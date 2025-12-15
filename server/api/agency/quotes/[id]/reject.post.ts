/**
 * Reject a quote
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  // Get the quote
  const quote = await queryOne(
    'SELECT id, status, quote_number FROM quotes WHERE id = $1',
    [quoteId]
  )

  if (!quote) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quote not found'
    })
  }

  // Check if quote can be rejected
  if (!['sent', 'viewed', 'pending'].includes(quote.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot reject a quote with status "${quote.status}"`
    })
  }

  // Update quote status to rejected
  const updated = await queryOne(`
    UPDATE quotes
    SET
      status = 'rejected',
      rejected_at = NOW(),
      rejection_reason = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [body.reason || body.rejectionReason || body.rejection_reason || null, quoteId])

  return {
    success: true,
    message: `Quote ${quote.quote_number} has been rejected`,
    quote: {
      id: updated.id,
      quoteNumber: updated.quote_number,
      status: updated.status,
      rejectedAt: updated.rejected_at,
      rejectionReason: updated.rejection_reason
    }
  }
})
