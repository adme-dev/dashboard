/**
 * Delete a quote line item
 */

import { queryOne, queryCount } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const itemId = getRouterParam(event, 'itemId')

  if (!quoteId || !itemId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID and Item ID are required'
    })
  }

  // Get the quote to check status
  const quote = await queryOne(
    'SELECT id, status FROM quotes WHERE id = $1',
    [quoteId]
  )

  if (!quote) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quote not found'
    })
  }

  // Check if quote can be modified
  if (['accepted', 'rejected'].includes(quote.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot modify a ${quote.status} quote`
    })
  }

  // Get the line item to verify it exists
  const item = await queryOne(
    'SELECT id, name FROM quote_line_items WHERE id = $1 AND quote_id = $2',
    [itemId, quoteId]
  )

  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Line item not found'
    })
  }

  // Delete the line item
  await queryCount(
    'DELETE FROM quote_line_items WHERE id = $1 AND quote_id = $2',
    [itemId, quoteId]
  )

  // Update quote totals
  await queryOne(`
    UPDATE quotes
    SET
      subtotal = (
        SELECT COALESCE(SUM(line_total), 0)
        FROM quote_line_items
        WHERE quote_id = $1 AND is_included = true
      ),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [quoteId])

  // Recalculate total
  await queryOne(`
    UPDATE quotes
    SET
      total = subtotal - (subtotal * discount_percent / 100) + ((subtotal - (subtotal * discount_percent / 100)) * tax_percent / 100),
      discount_amount = subtotal * discount_percent / 100,
      tax_amount = (subtotal - (subtotal * discount_percent / 100)) * tax_percent / 100
    WHERE id = $1
  `, [quoteId])

  return {
    success: true,
    message: `Line item "${item.name}" has been deleted`
  }
})
