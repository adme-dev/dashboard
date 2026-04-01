/**
 * List invoices
 * GET /api/agency/invoices
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const { user, clientIds } = await requireInvoiceAccess(event)
  const query = getQuery(event)

  const {
    clientId,
    projectId,
    status,
    startDate,
    endDate,
    search,
    limit = 50,
    offset = 0,
    sortBy = 'issue_date',
    sortOrder = 'desc'
  } = query

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`i.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (projectId) {
      conditions.push(`i.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`i.status = $${idx}`)
      params.push(status)
      idx++
    }

    if (startDate) {
      conditions.push(`i.issue_date >= $${idx}`)
      params.push(startDate)
      idx++
    }

    if (endDate) {
      conditions.push(`i.issue_date <= $${idx}`)
      params.push(endDate)
      idx++
    }

    if (search) {
      conditions.push(`(i.invoice_number ILIKE $${idx} OR c.name ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }

    if (clientIds !== 'all') {
      conditions.push(`i.client_id = ANY($${idx}::uuid[])`)
      params.push(clientIds)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Validate sort column
    const validSortColumns = ['issue_date', 'due_date', 'total_amount', 'status', 'invoice_number']
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'issue_date'
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Get invoices
    const invoices = await queryRows(`
      SELECT
        i.id,
        i.invoice_number,
        i.client_id,
        c.name as client_name,
        c.email as client_email,
        i.project_id,
        p.name as project_name,
        i.issue_date,
        i.due_date,
        i.paid_date,
        i.subtotal,
        i.tax_rate,
        i.tax_amount,
        i.discount_amount,
        i.total_amount,
        i.amount_paid,
        i.total_amount - COALESCE(i.amount_paid, 0) as amount_due,
        i.currency,
        i.status,
        i.payment_terms,
        i.sent_at,
        i.viewed_at,
        i.created_at,
        i.created_by,
        CASE
          WHEN i.status = 'paid' THEN 0
          WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled') THEN CURRENT_DATE - i.due_date
          ELSE 0
        END as days_overdue,
        (SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = i.id) as line_item_count
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      ${whereClause}
      ORDER BY i.${sortColumn} ${sortDir}
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset])

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      ${whereClause}
    `, params)

    // Get summary stats
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'overdue' OR (due_date < CURRENT_DATE AND status NOT IN ('paid', 'cancelled')) THEN 1 END) as overdue_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COALESCE(SUM(total_amount), 0) as total_invoiced,
        COALESCE(SUM(amount_paid), 0) as total_collected,
        COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) as total_outstanding
      FROM invoices i
      ${whereClause}
    `, params)

    return {
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        clientId: inv.client_id,
        clientName: inv.client_name,
        clientEmail: inv.client_email,
        projectId: inv.project_id,
        projectName: inv.project_name,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        paidDate: inv.paid_date,
        subtotal: Number(inv.subtotal || 0),
        taxRate: Number(inv.tax_rate || 0),
        taxAmount: Number(inv.tax_amount || 0),
        discountAmount: Number(inv.discount_amount || 0),
        totalAmount: Number(inv.total_amount || 0),
        amountPaid: Number(inv.amount_paid || 0),
        amountDue: Number(inv.amount_due || 0),
        currency: inv.currency,
        status: inv.status,
        paymentTerms: inv.payment_terms,
        sentAt: inv.sent_at,
        viewedAt: inv.viewed_at,
        createdAt: inv.created_at,
        createdBy: inv.created_by,
        daysOverdue: Number(inv.days_overdue || 0),
        lineItemCount: Number(inv.line_item_count || 0)
      })),
      pagination: {
        total: Number(countResult?.total || 0),
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + invoices.length < Number(countResult?.total || 0)
      },
      summary: {
        totalInvoices: Number(summary?.total_invoices || 0),
        draftCount: Number(summary?.draft_count || 0),
        sentCount: Number(summary?.sent_count || 0),
        overdueCount: Number(summary?.overdue_count || 0),
        paidCount: Number(summary?.paid_count || 0),
        totalInvoiced: Number(summary?.total_invoiced || 0),
        totalCollected: Number(summary?.total_collected || 0),
        totalOutstanding: Number(summary?.total_outstanding || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch invoices:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invoices'
    })
  }
})
