/**
 * Create invoice
 * POST /api/agency/invoices
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const { user, clientIds } = await requireInvoiceAccess(event)
  const body = await readBody(event)

  const {
    clientId,
    projectId,
    issueDate,
    dueDate,
    taxRate = 0,
    discountAmount = 0,
    discountPercent = 0,
    paymentTerms = 'net_30',
    notes,
    terms,
    lineItems = []
  } = body

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  if (clientIds !== 'all') {
    if (!clientIds.includes(clientId)) {
      throw createError({ statusCode: 403, statusMessage: 'Not assigned to this client' })
    }
  }

  try {
    // Get client info for billing snapshot
    const client = await queryOne(`
      SELECT name, email, billing_address, phone
      FROM agency_clients
      WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Calculate due date if not provided
    let calculatedDueDate = dueDate
    if (!calculatedDueDate) {
      const issueDateObj = issueDate ? new Date(issueDate) : new Date()
      const daysToAdd = paymentTerms === 'net_15' ? 15 :
                        paymentTerms === 'net_30' ? 30 :
                        paymentTerms === 'net_45' ? 45 :
                        paymentTerms === 'net_60' ? 60 :
                        paymentTerms === 'due_on_receipt' ? 0 : 30
      issueDateObj.setDate(issueDateObj.getDate() + daysToAdd)
      calculatedDueDate = issueDateObj.toISOString().split('T')[0]
    }

    // Create invoice
    const invoice = await queryOne(`
      INSERT INTO invoices (
        client_id,
        project_id,
        issue_date,
        due_date,
        tax_rate,
        discount_amount,
        discount_percent,
        payment_terms,
        notes,
        terms,
        billing_name,
        billing_email,
        billing_address,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft')
      RETURNING *
    `, [
      clientId,
      projectId || null,
      issueDate || new Date().toISOString().split('T')[0],
      calculatedDueDate,
      taxRate,
      discountAmount,
      discountPercent,
      paymentTerms,
      notes || null,
      terms || null,
      client.name,
      client.email,
      client.billing_address,
      user.id
    ])

    // Add line items if provided
    if (lineItems.length > 0) {
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
          invoice.id,
          item.description,
          item.quantity || 1,
          item.unitPrice || item.unit_price || 0,
          item.itemType || item.item_type || 'service',
          item.taxable !== false,
          item.timeEntryId || item.time_entry_id || null,
          item.projectId || item.project_id || projectId || null,
          i
        ])
      }
    }

    // Fetch complete invoice with totals
    const fullInvoice = await queryOne(`
      SELECT
        i.*,
        c.name as client_name,
        p.name as project_name
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
    `, [invoice.id])

    // Fetch line items
    const items = await queryRows(`
      SELECT * FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY sort_order
    `, [invoice.id])

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
        billingName: fullInvoice.billing_name,
        billingEmail: fullInvoice.billing_email,
        billingAddress: fullInvoice.billing_address,
        createdAt: fullInvoice.created_at,
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
    console.error('Failed to create invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create invoice'
    })
  }
})
