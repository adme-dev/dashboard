/**
 * Client Portal - List Invoices
 * GET /api/agency/client-portal/invoices
 *
 * Query params:
 * - clientId: Client ID (required)
 * - status: Filter by status
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string
  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    const conditions: string[] = ['i.client_id = $1']
    const params: any[] = [clientId]
    let idx = 2

    if (status && status !== 'all') {
      conditions.push(`i.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)

    const invoices = await queryRows(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.issue_date,
        i.due_date,
        i.subtotal,
        i.tax_amount,
        i.total_amount,
        i.amount_paid,
        i.notes,
        p.id as project_id,
        p.name as project_name
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE i.status
          WHEN 'overdue' THEN 0
          WHEN 'sent' THEN 1
          WHEN 'paid' THEN 2
          ELSE 3
        END,
        i.due_date ASC NULLS LAST,
        i.issue_date DESC
      LIMIT $${idx}
    `, params)

    // Get summary
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COALESCE(SUM(total_amount), 0) as total_billed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount - amount_paid ELSE 0 END), 0) as total_outstanding
      FROM invoices
      WHERE client_id = $1
    `, [clientId])

    return {
      invoices: invoices.map(i => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        status: i.status,
        issueDate: i.issue_date,
        dueDate: i.due_date,
        subtotal: Number(i.subtotal || 0),
        taxAmount: Number(i.tax_amount || 0),
        totalAmount: Number(i.total_amount || 0),
        amountPaid: Number(i.amount_paid || 0),
        amountDue: Number(i.total_amount || 0) - Number(i.amount_paid || 0),
        notes: i.notes,
        projectId: i.project_id,
        projectName: i.project_name,
        isOverdue: i.status === 'overdue' || (i.status === 'sent' && new Date(i.due_date) < new Date())
      })),
      summary: {
        total: Number(summary?.total || 0),
        paid: Number(summary?.paid || 0),
        sent: Number(summary?.sent || 0),
        overdue: Number(summary?.overdue || 0),
        draft: Number(summary?.draft || 0),
        totalBilled: Number(summary?.total_billed || 0),
        totalPaid: Number(summary?.total_paid || 0),
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
