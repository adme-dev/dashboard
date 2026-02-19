/**
 * Send a quote (mark as sent and email to client)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'
import { sendQuoteEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  // Get the quote with client info
  const quote = await queryOne(`
    SELECT
      q.id, q.status, q.quote_number, q.total, q.currency, q.valid_until,
      q.client_notes, q.contact_email, q.contact_name,
      c.id as client_id, c.name as client_name
    FROM quotes q
    JOIN agency_clients c ON q.client_id = c.id
    WHERE q.id = $1
  `, [quoteId])

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

  // Get line items for the email
  const lineItems = await queryRows(`
    SELECT description, quantity, unit_price, total
    FROM quote_line_items
    WHERE quote_id = $1
    ORDER BY sort_order, created_at
  `, [quoteId])

  if (lineItems.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot send a quote without line items'
    })
  }

  // Update quote status to sent
  const clientNotes = body.clientNotes || body.client_notes || quote.client_notes
  const updated = await queryOne(`
    UPDATE quotes
    SET
      status = 'sent',
      sent_at = NOW(),
      client_notes = COALESCE($1, client_notes),
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [clientNotes, quoteId])

  // Determine email recipient
  const recipientEmail = body.email || quote.contact_email
  if (!recipientEmail) {
    // Quote is marked as sent but no email could be sent
    return {
      success: true,
      message: `Quote ${quote.quote_number} has been marked as sent (no email address provided)`,
      emailSent: false,
      quote: {
        id: updated.id,
        quoteNumber: updated.quote_number,
        status: updated.status,
        sentAt: updated.sent_at,
        total: Number(updated.total)
      }
    }
  }

  // Send the quote email
  let emailSent = false
  try {
    await sendQuoteEmail({
      to: recipientEmail,
      clientName: quote.client_name,
      clientContactName: quote.contact_name,
      quoteNumber: quote.quote_number,
      quoteId: quote.id,
      total: Number(quote.total),
      currency: quote.currency || 'USD',
      validUntil: quote.valid_until ? new Date(quote.valid_until) : undefined,
      lineItems: lineItems.map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        total: Number(item.total)
      })),
      clientNotes,
      senderName: user.name,
      senderEmail: user.email
    })
    emailSent = true
  } catch (emailError) {
    console.error('Failed to send quote email:', emailError)
    // Don't fail the request if email fails - quote is still marked as sent
  }

  return {
    success: true,
    message: `Quote ${quote.quote_number} has been ${emailSent ? 'sent to ' + recipientEmail : 'marked as sent'}`,
    emailSent,
    quote: {
      id: updated.id,
      quoteNumber: updated.quote_number,
      status: updated.status,
      sentAt: updated.sent_at,
      total: Number(updated.total)
    }
  }
})
