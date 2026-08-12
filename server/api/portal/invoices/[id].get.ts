/**
 * Client Portal - Invoice Detail
 * GET /api/portal/invoices/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { dollarsFromCents, portalStatusForXeroInvoice, xeroInvoiceAging } from '~~/server/utils/portalXeroInvoices'

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
    const xeroInvoice = await queryOne(`
      SELECT
        i.tenant_id,
        i.invoice_id AS id,
        i.invoice_number,
        i.status,
        i.date AS issue_date,
        i.due_date,
        i.fully_paid_on_date AS paid_date,
        i.subtotal_cents,
        i.total_tax_cents AS tax_cents,
        i.total_cents,
        i.amount_paid_cents,
        i.amount_due_cents,
        i.currency_code AS currency,
        i.reference
      FROM xero_invoices_cache i
      JOIN agency_clients c
        ON c.xero_contact_id = i.contact_id
       AND c.id = $2
      WHERE i.invoice_id = $1
        AND i.type = 'ACCREC'
        AND i.status IN ('AUTHORISED', 'PAID')
      ORDER BY i.synced_at DESC
      LIMIT 1
    `, [invoiceId, clientUser.clientId])

    if (xeroInvoice) {
      const lineItems = await queryRows(`
        SELECT
          line_item_id AS id,
          description,
          quantity,
          unit_amount_cents,
          line_ex_gst_cents,
          tax_amount_cents
        FROM xero_invoice_lines_cache
        WHERE tenant_id = $1
          AND invoice_id = $2
        ORDER BY line_item_id ASC
      `, [xeroInvoice.tenant_id, invoiceId])

      const aging = xeroInvoiceAging(xeroInvoice)
      const subtotal = dollarsFromCents(xeroInvoice.subtotal_cents)
      const taxAmount = dollarsFromCents(xeroInvoice.tax_cents)

      return {
        invoice: {
          id: xeroInvoice.id,
          invoiceNumber: xeroInvoice.invoice_number,
          status: portalStatusForXeroInvoice(xeroInvoice),
          issueDate: xeroInvoice.issue_date,
          dueDate: xeroInvoice.due_date,
          paidDate: xeroInvoice.paid_date,
          subtotal,
          taxRate: subtotal > 0 ? (taxAmount / subtotal) * 100 : 0,
          taxAmount,
          discountAmount: 0,
          totalAmount: dollarsFromCents(xeroInvoice.total_cents),
          amountPaid: dollarsFromCents(xeroInvoice.amount_paid_cents),
          amountDue: dollarsFromCents(xeroInvoice.amount_due_cents),
          currency: xeroInvoice.currency || 'AUD',
          paymentTerms: null,
          notes: xeroInvoice.reference,
          terms: null,
          billingName: clientUser.clientName,
          billingEmail: null,
          projectId: null,
          projectName: null,
          createdAt: xeroInvoice.issue_date,
          ...aging
        },
        lineItems: lineItems.map(lineItem => ({
          id: lineItem.id,
          description: lineItem.description,
          quantity: Number(lineItem.quantity || 0),
          unitPrice: dollarsFromCents(lineItem.unit_amount_cents),
          amount: dollarsFromCents(lineItem.line_ex_gst_cents),
          itemType: 'service',
          taxable: Number(lineItem.tax_amount_cents || 0) > 0
        }))
      }
    }

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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch invoice:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch invoice' })
  }
})
