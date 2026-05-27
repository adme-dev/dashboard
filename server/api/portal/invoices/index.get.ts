/**
 * Client Portal - List Invoices
 * GET /api/portal/invoices
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewInvoices) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view invoices' })
  }

  const query = getQuery(event)
  const view = query.view as 'current' | 'history' | undefined
  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['i.client_id = $1']
    const params: unknown[] = [clientUser.clientId]
    let idx = 2

    if (view === 'current') {
      conditions.push('i.status IN (\'sent\', \'overdue\')')
    } else if (view === 'history') {
      conditions.push('i.status = \'paid\'')
    } else if (status && status !== 'all') {
      conditions.push(`i.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)
    params.push(view ?? null)
    const viewParamIndex = idx + 1

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
        CASE WHEN $${viewParamIndex} = 'history' THEN i.paid_date END DESC NULLS LAST,
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

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue,
        COUNT(CASE WHEN status IN ('sent', 'overdue') THEN 1 END) as current,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as history,
        COUNT(CASE WHEN status IN ('sent', 'overdue') AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as due_next_7_count,
        MAX(CASE WHEN status = 'paid' THEN paid_date END) as last_paid_date,
        MIN(CASE WHEN status IN ('sent', 'overdue') THEN due_date END) as next_due_date,
        COUNT(CASE WHEN status IN ('sent', 'overdue') AND due_date >= CURRENT_DATE THEN 1 END) as aging_current_count,
        COUNT(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as aging_30_count,
        COUNT(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days' THEN 1 END) as aging_60_count,
        COUNT(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '60 days' THEN 1 END) as aging_90_count,
        COALESCE(SUM(total_amount), 0) as total_billed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'paid' AND paid_date >= CURRENT_DATE - INTERVAL '90 days' THEN total_amount ELSE 0 END), 0) as paid_last_90,
        COALESCE(AVG(CASE WHEN status = 'paid' THEN total_amount END), 0) as avg_paid_invoice,
        COALESCE(AVG(CASE WHEN status = 'paid' AND paid_date IS NOT NULL AND issue_date IS NOT NULL THEN paid_date - issue_date END), 0) as avg_days_to_pay,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_amount - amount_paid ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days' THEN total_amount - amount_paid ELSE 0 END), 0) as due_next_7_amount,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount - amount_paid ELSE 0 END), 0) as overdue_amount,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date >= CURRENT_DATE THEN total_amount - amount_paid ELSE 0 END), 0) as aging_current_amount,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days' THEN total_amount - amount_paid ELSE 0 END), 0) as aging_30_amount,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days' THEN total_amount - amount_paid ELSE 0 END), 0) as aging_60_amount,
        COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') AND due_date < CURRENT_DATE - INTERVAL '60 days' THEN total_amount - amount_paid ELSE 0 END), 0) as aging_90_amount
      FROM invoices
      WHERE client_id = $1
    `, [clientUser.clientId])

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
        current: Number(summary?.current || 0),
        history: Number(summary?.history || 0),
        dueNext7Count: Number(summary?.due_next_7_count || 0),
        lastPaidDate: summary?.last_paid_date || null,
        nextDueDate: summary?.next_due_date || null,
        totalBilled: Number(summary?.total_billed || 0),
        totalPaid: Number(summary?.total_paid || 0),
        paidLast90: Number(summary?.paid_last_90 || 0),
        averagePaidInvoice: Number(summary?.avg_paid_invoice || 0),
        averageDaysToPay: Math.round(Number(summary?.avg_days_to_pay || 0)),
        totalOutstanding: Number(summary?.total_outstanding || 0),
        dueNext7Amount: Number(summary?.due_next_7_amount || 0),
        overdueAmount: Number(summary?.overdue_amount || 0),
        aging: {
          current: {
            count: Number(summary?.aging_current_count || 0),
            amount: Number(summary?.aging_current_amount || 0)
          },
          thirty: {
            count: Number(summary?.aging_30_count || 0),
            amount: Number(summary?.aging_30_amount || 0)
          },
          sixty: {
            count: Number(summary?.aging_60_count || 0),
            amount: Number(summary?.aging_60_amount || 0)
          },
          ninetyPlus: {
            count: Number(summary?.aging_90_count || 0),
            amount: Number(summary?.aging_90_amount || 0)
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch invoices:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch invoices' })
  }
})
