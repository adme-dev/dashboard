/**
 * Update Invoice Line Item
 * PUT /api/agency/invoices/:id/line-items/:lineItemId
 *
 * Updates a line item on an invoice
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface UpdateLineItemBody {
  description?: string
  quantity?: number
  unitPrice?: number
  itemType?: 'service' | 'expense' | 'product' | 'discount' | 'other'
  taxable?: boolean
  sortOrder?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can modify invoices
  await requireRole(event, ['owner', 'admin', 'sales'])

  const invoiceId = getRouterParam(event, 'id')
  const lineItemId = getRouterParam(event, 'lineItemId')
  const body = await readBody<UpdateLineItemBody>(event)

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

  // Build dynamic update
  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.description !== undefined) {
    if (!body.description.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Description cannot be empty'
      })
    }
    fields.push(`description = $${idx}`)
    values.push(body.description.trim())
    idx++
  }

  if (body.quantity !== undefined) {
    if (body.quantity <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Quantity must be greater than 0'
      })
    }
    fields.push(`quantity = $${idx}`)
    values.push(body.quantity)
    idx++
  }

  if (body.unitPrice !== undefined) {
    fields.push(`unit_price = $${idx}`)
    values.push(body.unitPrice)
    idx++
  }

  if (body.itemType !== undefined) {
    fields.push(`item_type = $${idx}`)
    values.push(body.itemType)
    idx++
  }

  if (body.taxable !== undefined) {
    fields.push(`taxable = $${idx}`)
    values.push(body.taxable)
    idx++
  }

  if (body.sortOrder !== undefined) {
    fields.push(`sort_order = $${idx}`)
    values.push(body.sortOrder)
    idx++
  }

  if (fields.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No fields to update'
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
        statusMessage: `Cannot modify line items on a ${invoice.status} invoice`
      })
    }

    // Check if line item exists
    const existingItem = await queryOne(
      `SELECT id FROM invoice_line_items WHERE id = $1 AND invoice_id = $2`,
      [lineItemId, invoiceId]
    )

    if (!existingItem) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Line item not found'
      })
    }

    values.push(lineItemId)
    values.push(invoiceId)

    let lineItem: any
    await transaction(async (client) => {
      // Update line item
      const result = await client.query(`
        UPDATE invoice_line_items
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${idx} AND invoice_id = $${idx + 1}
        RETURNING *
      `, values)
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
        updatedAt: lineItem.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update invoice line item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update invoice line item'
    })
  }
})
