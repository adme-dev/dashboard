/**
 * List Expenses
 * GET /api/agency/expenses
 *
 * Query params:
 * - status: Filter by status
 * - userId: Filter by user
 * - projectId: Filter by project
 * - clientId: Filter by client
 * - categoryId: Filter by category
 * - startDate: Filter from date
 * - endDate: Filter to date
 * - billable: Filter billable only
 * - reimbursable: Filter reimbursable only
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const userId = query.userId as string | undefined
  const projectId = query.projectId as string | undefined
  const clientId = query.clientId as string | undefined
  const categoryId = query.categoryId as string | undefined
  const startDate = query.startDate as string | undefined
  const endDate = query.endDate as string | undefined
  const billable = query.billable === 'true' ? true : query.billable === 'false' ? false : undefined
  const reimbursable = query.reimbursable === 'true' ? true : query.reimbursable === 'false' ? false : undefined
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    // Build query conditions
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (status && status !== 'all') {
      conditions.push(`e.status = $${idx}`)
      params.push(status)
      idx++
    }

    if (userId) {
      conditions.push(`e.user_id = $${idx}`)
      params.push(userId)
      idx++
    }

    if (projectId) {
      conditions.push(`e.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (clientId) {
      conditions.push(`e.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (categoryId) {
      conditions.push(`e.category_id = $${idx}`)
      params.push(categoryId)
      idx++
    }

    if (startDate) {
      conditions.push(`e.expense_date >= $${idx}`)
      params.push(startDate)
      idx++
    }

    if (endDate) {
      conditions.push(`e.expense_date <= $${idx}`)
      params.push(endDate)
      idx++
    }

    if (billable !== undefined) {
      conditions.push(`e.billable = $${idx}`)
      params.push(billable)
      idx++
    }

    if (reimbursable !== undefined) {
      conditions.push(`e.reimbursable = $${idx}`)
      params.push(reimbursable)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get expenses
    const limitIdx = idx
    const offsetIdx = idx + 1
    params.push(limit, offset)

    const expenses = await queryRows(`
      SELECT
        e.id,
        e.user_id,
        tm.name as user_name,
        e.category_id,
        ec.name as category_name,
        ec.code as category_code,
        e.project_id,
        p.name as project_name,
        e.client_id,
        c.name as client_name,
        e.amount,
        e.currency,
        e.tax_amount,
        e.total_amount,
        e.merchant,
        e.description,
        e.expense_date,
        e.billable,
        e.invoiced,
        e.status,
        e.payment_method,
        e.reimbursable,
        e.reimbursed,
        e.has_receipt,
        e.receipt_url,
        e.submitted_at,
        e.approved_at,
        e.created_at
      FROM expenses e
      JOIN team_members tm ON e.user_id = tm.id
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN agency_clients c ON e.client_id = c.id
      ${whereClause}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params)

    // Get summary stats (without limit/offset)
    const summaryParams = params.slice(0, -2) // Remove limit and offset
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(e.total_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN e.billable THEN e.total_amount ELSE 0 END), 0) as billable_amount,
        COALESCE(SUM(CASE WHEN e.reimbursable AND NOT e.reimbursed THEN e.total_amount ELSE 0 END), 0) as pending_reimbursement,
        COUNT(CASE WHEN e.status = 'pending_approval' THEN 1 END) as pending_approval_count,
        COUNT(CASE WHEN e.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN e.status = 'rejected' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN NOT e.has_receipt AND e.total_amount >= 25 THEN 1 END) as missing_receipts
      FROM expenses e
      ${whereClause}
    `, summaryParams)

    // Get categories for filter dropdown
    const categories = await queryRows(`
      SELECT id, name, code
      FROM expense_categories
      WHERE is_active = true
      ORDER BY name
    `)

    return {
      expenses: expenses.map(e => ({
        id: e.id,
        userId: e.user_id,
        userName: e.user_name,
        categoryId: e.category_id,
        categoryName: e.category_name,
        categoryCode: e.category_code,
        projectId: e.project_id,
        projectName: e.project_name,
        clientId: e.client_id,
        clientName: e.client_name,
        amount: Number(e.amount || 0),
        currency: e.currency,
        taxAmount: Number(e.tax_amount || 0),
        totalAmount: Number(e.total_amount || 0),
        merchant: e.merchant,
        description: e.description,
        expenseDate: e.expense_date,
        billable: e.billable,
        invoiced: e.invoiced,
        status: e.status,
        paymentMethod: e.payment_method,
        reimbursable: e.reimbursable,
        reimbursed: e.reimbursed,
        hasReceipt: e.has_receipt,
        receiptUrl: e.receipt_url,
        submittedAt: e.submitted_at,
        approvedAt: e.approved_at,
        createdAt: e.created_at
      })),
      summary: {
        totalCount: Number(summary.total_count || 0),
        totalAmount: Number(summary.total_amount || 0),
        billableAmount: Number(summary.billable_amount || 0),
        pendingReimbursement: Number(summary.pending_reimbursement || 0),
        pendingApprovalCount: Number(summary.pending_approval_count || 0),
        approvedCount: Number(summary.approved_count || 0),
        rejectedCount: Number(summary.rejected_count || 0),
        missingReceipts: Number(summary.missing_receipts || 0)
      },
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code
      })),
      pagination: {
        limit,
        offset,
        total: Number(summary.total_count || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch expenses:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch expenses'
    })
  }
})
