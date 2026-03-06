/**
 * Client Portal - Invoice Detail
 * GET /api/portal/invoices/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewInvoices) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view invoices' })
  }

  const invoiceId = getRouterParam(event, 'id')
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invoice ID is required' })
  }

  try {
    const invoice = await queryOne(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.issue_date,
        i.due_date,
        i.paid_date,
        i.subtotal,
        i.tax_rate,
        i.tax_amount,
        i.discount_amount,
        i.total_amount,
        i.amount_paid,
        i.currency,
        i.payment_terms,
        i.notes,
        i.terms,
        i.billing_name,
        i.billing_email,
        i.created_at,
        p.id as project_id,
        p.name as project_name
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1 AND i.client_id = $2
    `, [invoiceId, clientUser.clientId])

    if (!invoice) {
      throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
    }

    // Fetch line items
    const lineItems = await queryRows(`
      SELECT
        id,
        description,
        quantity,
        unit_price,
        amount,
        item_type,
        taxable,
        sort_order
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY sort_order ASC, id ASC
    `, [invoiceId])

    // Calculate aging
    const dueDate = new Date(invoice.due_date)
    const now = new Date()
    const daysOverdue = invoice.status !== 'paid'
      ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    let agingBucket = 'current'
    if (daysOverdue > 90) agingBucket = '90+'
    else if (daysOverdue > 60) agingBucket = '60d'
    else if (daysOverdue > 30) agingBucket = '30d'

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        status: invoice.status,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        paidDate: invoice.paid_date,
        subtotal: Number(invoice.subtotal || 0),
        taxRate: Number(invoice.tax_rate || 0),
        taxAmount: Number(invoice.tax_amount || 0),
        discountAmount: Number(invoice.discount_amount || 0),
        totalAmount: Number(invoice.total_amount || 0),
        amountPaid: Number(invoice.amount_paid || 0),
        amountDue: Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0),
        currency: invoice.currency || 'AUD',
        paymentTerms: invoice.payment_terms,
        notes: invoice.notes,
        terms: invoice.terms,
        billingName: invoice.billing_name,
        billingEmail: invoice.billing_email,
        projectId: invoice.project_id,
        projectName: invoice.project_name,
        createdAt: invoice.created_at,
        daysOverdue,
        agingBucket,
        isOverdue: daysOverdue > 0 && invoice.status !== 'paid'
      },
      lineItems: lineItems.map(li => ({
        id: li.id,
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unit_price),
        amount: Number(li.amount),
        itemType: li.item_type,
        taxable: li.taxable
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch invoice:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch invoice' })
  }
})
