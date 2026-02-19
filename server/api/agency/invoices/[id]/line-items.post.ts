/**
 * Add Invoice Line Item
 * POST /api/agency/invoices/:id/line-items
 *
 * Adds a new line item to an invoice
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface LineItemBody {
  description: string
  quantity: number
  unitPrice: number
  itemType?: 'service' | 'expense' | 'product' | 'discount' | 'other'
  taxable?: boolean
  timeEntryId?: string
  projectId?: string
  sortOrder?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can modify invoices
  await requireRole(event, ['owner', 'admin', 'sales'])

  const invoiceId = getRouterParam(event, 'id')
  const body = await readBody<LineItemBody>(event)

  if (!invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  if (!body.description?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Line item description is required'
    })
  }

  if (body.quantity === undefined || body.quantity <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid quantity is required'
    })
  }

  if (body.unitPrice === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unit price is required'
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
        statusMessage: `Cannot add line items to a ${invoice.status} invoice`
      })
    }

    // Get the next sort order if not specified
    let sortOrder = body.sortOrder
    if (sortOrder === undefined) {
      const maxSort = await queryOne(
        `SELECT MAX(sort_order) as max_order FROM invoice_line_items WHERE invoice_id = $1`,
        [invoiceId]
      )
      sortOrder = (maxSort?.max_order || 0) + 1
    }

    let lineItem: any
    await transaction(async (client) => {
      // Insert line item
      const result = await client.query(`
        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          item_type,
          taxable,
          time_entry_id,
          project_id,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        invoiceId,
        body.description.trim(),
        body.quantity,
        body.unitPrice,
        body.itemType || 'service',
        body.taxable !== false,
        body.timeEntryId || null,
        body.projectId || null,
        sortOrder
      ])
      lineItem = result.rows[0]

      // Recalculate invoice totals
      const totals = await client.query(`
        SELECT
          SUM(quantity * unit_price) as subtotal,
          SUM(CASE WHEN taxable THEN quantity * unit_price ELSE 0 END) as taxable_amount
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
      lineItem: {
        id: lineItem.id,
        invoiceId: lineItem.invoice_id,
        description: lineItem.description,
        quantity: Number(lineItem.quantity),
        unitPrice: Number(lineItem.unit_price),
        amount: Number(lineItem.quantity) * Number(lineItem.unit_price),
        itemType: lineItem.item_type,
        taxable: lineItem.taxable,
        timeEntryId: lineItem.time_entry_id,
        projectId: lineItem.project_id,
        sortOrder: lineItem.sort_order,
        createdAt: lineItem.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add invoice line item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add invoice line item'
    })
  }
})
