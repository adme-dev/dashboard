/**
 * Send a quote (mark as sent)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
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
    'SELECT id, status, quote_number, total FROM quotes WHERE id = $1',
    [quoteId]
  )

  if (!quote) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quote not found'
    })
  }

  // Check if quote can be sent
  if (!['draft', 'pending', 'revised'].includes(quote.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot send a quote with status "${quote.status}"`
    })
  }

  // Check if quote has line items
  const items = await queryRows(
    'SELECT id FROM quote_line_items WHERE quote_id = $1',
    [quoteId]
  )

  if (items.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot send a quote without line items'
    })
  }

  // Update quote status to sent
  const updated = await queryOne(`
    UPDATE quotes
    SET
      status = 'sent',
      sent_at = NOW(),
      client_notes = COALESCE($1, client_notes),
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [body.clientNotes || body.client_notes, quoteId])

  // TODO: In a real application, you would:
  // 1. Generate a PDF of the quote
  // 2. Send an email to the client with the PDF attached
  // 3. Create a unique link for the client to view/accept the quote

  return {
    success: true,
    message: `Quote ${quote.quote_number} has been marked as sent`,
    quote: {
      id: updated.id,
      quoteNumber: updated.quote_number,
      status: updated.status,
      sentAt: updated.sent_at,
      total: Number(updated.total)
    }
  }
})
