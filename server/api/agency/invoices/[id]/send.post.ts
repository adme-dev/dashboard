/**
 * Send invoice (mark as sent)
 * POST /api/agency/invoices/:id/send
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    // Get invoice
    const invoice = await queryOne('SELECT * FROM invoices WHERE id = $1', [id])

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    if (invoice.status !== 'draft') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only draft invoices can be sent'
      })
    }

    // Update status to sent
    const updated = await queryOne(`
      UPDATE invoices SET
        status = 'sent',
        sent_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id])

    // In a real app, you would send an email here
    // For now, we just update the status

    return {
      success: true,
      invoice: {
        id: updated.id,
        invoiceNumber: updated.invoice_number,
        status: updated.status,
        sentAt: updated.sent_at
      },
      message: 'Invoice marked as sent'
    }
  } catch (error: any) {
    console.error('Failed to send invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send invoice'
    })
  }
})
