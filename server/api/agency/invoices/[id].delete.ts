/**
 * Delete/Cancel Invoice
 * DELETE /api/agency/invoices/:id
 *
 * Cancels or permanently deletes an invoice
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const { user, clientIds } = await requireInvoiceAccess(event)

  const invoiceId = getRouterParam(event, 'id')

  if (!invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  const query = getQuery(event)
  const hardDelete = query.hard === 'true'

  try {
    // Check if invoice exists
    const invoice = await queryOne(
      `SELECT id, invoice_number, status, amount_paid, client_id, created_by FROM invoices WHERE id = $1`,
      [invoiceId]
    )

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    if (clientIds !== 'all') {
      if (!clientIds.includes(invoice.client_id)) {
        throw createError({ statusCode: 403, statusMessage: 'Not authorized to delete this invoice' })
      }
      if (invoice.status !== 'draft') {
        throw createError({ statusCode: 403, statusMessage: 'Account managers can only delete draft invoices' })
      }
      if (invoice.created_by !== user.id) {
        throw createError({ statusCode: 403, statusMessage: 'Can only delete invoices you created' })
      }
    }

    // Don't allow deleting paid invoices
    if (invoice.status === 'paid' || Number(invoice.amount_paid) > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot delete an invoice that has payments recorded. Void or credit it instead.'
      })
    }

    if (hardDelete) {
      // Hard delete - only for draft invoices
      if (invoice.status !== 'draft') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Only draft invoices can be permanently deleted. Cancel the invoice instead.'
        })
      }

      await transaction(async (client) => {
        // Delete line items first
        await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId])
        // Delete payments (should be none for drafts)
        await client.query(`DELETE FROM invoice_payments WHERE invoice_id = $1`, [invoiceId])
        // Delete the invoice
        await client.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId])
      })

      return {
        success: true,
        message: 'Invoice permanently deleted',
        deleted: true
      }
    } else {
      // Soft delete - mark as cancelled
      await queryOne(`
        UPDATE invoices
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [invoiceId])

      return {
        success: true,
        message: 'Invoice cancelled successfully',
        cancelled: true
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete invoice:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete invoice'
    })
  }
})
