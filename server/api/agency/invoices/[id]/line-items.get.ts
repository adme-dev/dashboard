/**
 * Get Invoice Line Items
 * GET /api/agency/invoices/:id/line-items
 *
 * Returns all line items for an invoice
 */

import { queryRows } from '~~/server/utils/db'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'
import { assertInvoiceRowAccess } from '~~/server/utils/invoiceRowAccess'

export default defineEventHandler(async (event) => {
  const access = await requireInvoiceAccess(event)

  const invoiceId = getRouterParam(event, 'id')

  if (!invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    // Verify invoice exists
    const invoice = await assertInvoiceRowAccess(invoiceId, access)

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
        te.id AS scoped_time_entry_id,
        p.id AS scoped_project_id,
        te.description as time_entry_description,
        te.date as time_entry_date,
        te.hours as time_entry_hours,
        p.name as project_name
      FROM invoice_line_items li
      JOIN invoices i ON i.id = li.invoice_id
      LEFT JOIN time_entries te ON li.time_entry_id = te.id AND EXISTS (
        SELECT 1 FROM projects tp WHERE tp.id = te.project_id AND tp.client_id = i.client_id
      )
      LEFT JOIN projects p ON li.project_id = p.id AND p.client_id = i.client_id
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
        timeEntryId: item.scoped_time_entry_id,
        timeEntryDescription: item.time_entry_description,
        timeEntryDate: item.time_entry_date,
        timeEntryHours: item.time_entry_hours ? Number(item.time_entry_hours) : null,
        projectId: item.scoped_project_id,
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
