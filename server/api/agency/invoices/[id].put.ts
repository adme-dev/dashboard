/**
 * Update invoice
 * PUT /api/agency/invoices/:id
 */

import { queryOne, queryRows, queryCount } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    // Get existing invoice
    const existing = await queryOne('SELECT * FROM invoices WHERE id = $1', [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    // Don't allow editing paid or cancelled invoices
    if (existing.status === 'paid' || existing.status === 'cancelled') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot edit ${existing.status} invoice`
      })
    }

    const {
      clientId,
      projectId,
      issueDate,
      dueDate,
      taxRate,
      discountAmount,
      discountPercent,
      paymentTerms,
      notes,
      terms,
      footer,
      status,
      lineItems
    } = body

    // Update invoice
    const updated = await queryOne(`
      UPDATE invoices SET
        client_id = COALESCE($2, client_id),
        project_id = $3,
        issue_date = COALESCE($4, issue_date),
        due_date = COALESCE($5, due_date),
        tax_rate = COALESCE($6, tax_rate),
        discount_amount = COALESCE($7, discount_amount),
        discount_percent = COALESCE($8, discount_percent),
        payment_terms = COALESCE($9, payment_terms),
        notes = $10,
        terms = $11,
        footer = $12,
        status = COALESCE($13, status),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      clientId,
      projectId !== undefined ? projectId : existing.project_id,
      issueDate,
      dueDate,
      taxRate,
      discountAmount,
      discountPercent,
      paymentTerms,
      notes !== undefined ? notes : existing.notes,
      terms !== undefined ? terms : existing.terms,
      footer !== undefined ? footer : existing.footer,
      status
    ])

    // Update line items if provided
    if (lineItems !== undefined) {
      // Delete existing line items
      await queryCount('DELETE FROM invoice_line_items WHERE invoice_id = $1', [id])

      // Insert new line items
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i]
        await queryOne(`
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          id,
          item.description,
          item.quantity || 1,
          item.unitPrice || item.unit_price || 0,
          item.itemType || item.item_type || 'service',
          item.taxable !== false,
          item.timeEntryId || item.time_entry_id || null,
          item.projectId || item.project_id || null,
          i
        ])
      }
    }

    // Fetch updated invoice
    const fullInvoice = await queryOne(`
      SELECT
        i.*,
        c.name as client_name,
        p.name as project_name
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
    `, [id])

    const items = await queryRows(`
      SELECT * FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY sort_order
    `, [id])

    return {
      invoice: {
        id: fullInvoice.id,
        invoiceNumber: fullInvoice.invoice_number,
        clientId: fullInvoice.client_id,
        clientName: fullInvoice.client_name,
        projectId: fullInvoice.project_id,
        projectName: fullInvoice.project_name,
        issueDate: fullInvoice.issue_date,
        dueDate: fullInvoice.due_date,
        subtotal: Number(fullInvoice.subtotal || 0),
        taxRate: Number(fullInvoice.tax_rate || 0),
        taxAmount: Number(fullInvoice.tax_amount || 0),
        discountAmount: Number(fullInvoice.discount_amount || 0),
        totalAmount: Number(fullInvoice.total_amount || 0),
        amountPaid: Number(fullInvoice.amount_paid || 0),
        amountDue: Number(fullInvoice.total_amount || 0) - Number(fullInvoice.amount_paid || 0),
        currency: fullInvoice.currency,
        status: fullInvoice.status,
        paymentTerms: fullInvoice.payment_terms,
        notes: fullInvoice.notes,
        terms: fullInvoice.terms,
        footer: fullInvoice.footer,
        updatedAt: fullInvoice.updated_at,
        lineItems: items.map(item => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          amount: Number(item.quantity) * Number(item.unit_price),
          itemType: item.item_type,
          taxable: item.taxable
        }))
      }
    }
  } catch (error: any) {
    console.error('Failed to update invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update invoice'
    })
  }
})
