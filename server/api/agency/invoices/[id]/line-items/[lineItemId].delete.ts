/**
 * Delete Invoice Line Item
 * DELETE /api/agency/invoices/:id/line-items/:lineItemId
 *
 * Removes a line item from an invoice
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can modify invoices
  await requireRole(event, ['owner', 'admin', 'sales'])

  const invoiceId = getRouterParam(event, 'id')
  const lineItemId = getRouterParam(event, 'lineItemId')

  if (!invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  if (!lineItemId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Line item ID is required'
    })
  }

  try {
    // Check if invoice exists and is editable
    const invoice = await queryOne(
      `SELECT id, status, tax_rate FROM invoices WHERE id = $1`,
      [invoiceId]
    )

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    if (['paid', 'cancelled'].includes(invoice.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot remove line items from a ${invoice.status} invoice`
      })
    }

    // Check if line item exists
    const lineItem = await queryOne(
      `SELECT id, description FROM invoice_line_items WHERE id = $1 AND invoice_id = $2`,
      [lineItemId, invoiceId]
    )

    if (!lineItem) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Line item not found'
      })
    }

    await transaction(async (client) => {
      // Delete line item
      await client.query(
        `DELETE FROM invoice_line_items WHERE id = $1`,
        [lineItemId]
      )

      // Recalculate invoice totals
      const totals = await client.query(`
        SELECT
          COALESCE(SUM(quantity * unit_price), 0) as subtotal,
          COALESCE(SUM(CASE WHEN taxable THEN quantity * unit_price ELSE 0 END), 0) as taxable_amount
        FROM invoice_line_items
        WHERE invoice_id = $1
      `, [invoiceId])

      const subtotal = Number(totals.rows[0].subtotal) || 0
      const taxableAmount = Number(totals.rows[0].taxable_amount) || 0
      const taxRate = Number(invoice.tax_rate) || 0
      const taxAmount = taxableAmount * (taxRate / 100)
      const totalAmount = subtotal + taxAmount

      // Update invoice totals
      await client.query(`
        UPDATE invoices
        SET
          subtotal = $1,
          tax_amount = $2,
          total_amount = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [subtotal, taxAmount, totalAmount, invoiceId])
    })

    return {
      success: true,
      message: 'Line item deleted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete invoice line item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete invoice line item'
    })
  }
})
