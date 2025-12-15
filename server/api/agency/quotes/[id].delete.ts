/**
 * Delete a quote
 */

import { queryOne, queryCount } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'delete')

  const quoteId = getRouterParam(event, 'id')

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

  // Check if quote can be deleted
  if (quote.status === 'accepted') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete an accepted quote'
    })
  }

  // Delete line items first
  await queryCount(
    'DELETE FROM quote_line_items WHERE quote_id = $1',
    [quoteId]
  )

  // Delete the quote
  await queryCount(
    'DELETE FROM quotes WHERE id = $1',
    [quoteId]
  )

  return {
    success: true,
    message: `Quote ${quote.quote_number} has been deleted`
  }
})
