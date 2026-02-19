/**
 * Get Invoice Line Items
 * GET /api/agency/invoices/:id/line-items
 *
 * Returns all line items for an invoice
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const invoiceId = getRouterParam(event, 'id')

  if (!invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    // Verify invoice exists
    const invoice = await queryOne(
      `SELECT id, invoice_number FROM invoices WHERE id = $1`,
      [invoiceId]
    )

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    // Get line items
    const lineItems = await queryRows(`
      SELECT
        li.*,
        te.description as time_entry_description,
        te.date as time_entry_date,
        te.hours as time_entry_hours,
        p.name as project_name
      FROM invoice_line_items li
      LEFT JOIN time_entries te ON li.time_entry_id = te.id
      LEFT JOIN projects p ON li.project_id = p.id
      WHERE li.invoice_id = $1
      ORDER BY li.sort_order
    `, [invoiceId])

    return {
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      lineItems: lineItems.map(item => ({
        id: item.id,
        invoiceId: item.invoice_id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        amount: Number(item.quantity) * Number(item.unit_price),
        itemType: item.item_type,
        taxable: item.taxable,
        timeEntryId: item.time_entry_id,
        timeEntryDescription: item.time_entry_description,
        timeEntryDate: item.time_entry_date,
        timeEntryHours: item.time_entry_hours ? Number(item.time_entry_hours) : null,
        projectId: item.project_id,
        projectName: item.project_name,
        sortOrder: item.sort_order,
        createdAt: item.created_at
      })),
      total: lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0)
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch invoice line items:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invoice line items'
    })
  }
})
