/**
 * Get invoice by ID
 * GET /api/agency/invoices/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const { user, clientIds } = await requireInvoiceAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    // Get invoice
    const invoice = await queryOne(`
      SELECT
        i.*,
        c.name as client_name,
        c.contact_email as client_email,
        c.contact_phone as client_phone,
        c.address as client_billing_address,
        p.name as project_name,
        tm.name as created_by_name
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN team_members tm ON i.created_by = tm.id
      WHERE i.id = $1
    `, [id])

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    if (clientIds !== 'all' && !clientIds.includes(invoice.client_id)) {
      throw createError({ statusCode: 403, statusMessage: 'Not authorized to view this invoice' })
    }

    // Get line items
    const lineItems = await queryRows(`
      SELECT
        li.*,
        te.description as time_entry_description,
        te.date as time_entry_date,
        p.name as project_name
      FROM invoice_line_items li
      LEFT JOIN time_entries te ON li.time_entry_id = te.id
      LEFT JOIN projects p ON li.project_id = p.id
      WHERE li.invoice_id = $1
      ORDER BY li.sort_order
    `, [id])

    // Get payments
    const payments = await queryRows(`
      SELECT
        ip.*,
        tm.name as recorded_by_name
      FROM invoice_payments ip
      LEFT JOIN team_members tm ON ip.recorded_by = tm.id
      WHERE ip.invoice_id = $1
      ORDER BY ip.payment_date DESC
    `, [id])

    // Calculate days overdue
    const daysOverdue = invoice.status !== 'paid' && invoice.status !== 'cancelled' &&
      new Date(invoice.due_date) < new Date()
      ? Math.floor((new Date().getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientId: invoice.client_id,
        clientName: invoice.client_name,
        clientEmail: invoice.client_email,
        clientPhone: invoice.client_phone,
        clientBillingAddress: invoice.client_billing_address,
        projectId: invoice.project_id,
        projectName: invoice.project_name,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        paidDate: invoice.paid_date,
        subtotal: Number(invoice.subtotal || 0),
        taxRate: Number(invoice.tax_rate || 0),
        taxAmount: Number(invoice.tax_amount || 0),
        discountAmount: Number(invoice.discount_amount || 0),
        discountPercent: Number(invoice.discount_percent || 0),
        totalAmount: Number(invoice.total_amount || 0),
        amountPaid: Number(invoice.amount_paid || 0),
        amountDue: Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0),
        currency: invoice.currency,
        status: invoice.status,
        paymentTerms: invoice.payment_terms,
        notes: invoice.notes,
        terms: invoice.terms,
        footer: invoice.footer,
        billingName: invoice.billing_name,
        billingEmail: invoice.billing_email,
        billingAddress: invoice.billing_address,
        billingPhone: invoice.billing_phone,
        sentAt: invoice.sent_at,
        viewedAt: invoice.viewed_at,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
        createdByName: invoice.created_by_name,
        daysOverdue,
        lineItems: lineItems.map(item => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          amount: Number(item.quantity) * Number(item.unit_price),
          itemType: item.item_type,
          taxable: item.taxable,
          timeEntryId: item.time_entry_id,
          timeEntryDescription: item.time_entry_description,
          timeEntryDate: item.time_entry_date,
          projectId: item.project_id,
          projectName: item.project_name,
          sortOrder: item.sort_order
        })),
        payments: payments.map(payment => ({
          id: payment.id,
          amount: Number(payment.amount),
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          referenceNumber: payment.reference_number,
          transactionId: payment.transaction_id,
          notes: payment.notes,
          recordedByName: payment.recorded_by_name,
          createdAt: payment.created_at
        }))
      }
    }
  } catch (error: any) {
    console.error('Failed to fetch invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invoice'
    })
  }
})
