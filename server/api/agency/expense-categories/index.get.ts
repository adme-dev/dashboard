/**
 * Get Expense Categories
 * GET /api/agency/expense-categories
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const activeOnly = query.active !== 'false'
  const parentId = query.parentId as string | undefined
  const includeHierarchy = query.hierarchy === 'true'

  try {
    let sql: string
    let params: any[] = []

    if (includeHierarchy) {
      // Get categories with parent info
      sql = `
        SELECT
          ec.*,
          parent.name as parent_name,
          (SELECT COUNT(*) FROM expenses e WHERE e.category_id = ec.id) as expense_count,
          (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.category_id = ec.id) as total_amount
        FROM expense_categories ec
        LEFT JOIN expense_categories parent ON ec.parent_id = parent.id
        WHERE ($1 = false OR ec.is_active = true)
        ORDER BY ec.parent_id NULLS FIRST, ec.name
      `
      params = [!activeOnly]
    } else if (parentId) {
      sql = `
        SELECT ec.*,
          (SELECT COUNT(*) FROM expenses e WHERE e.category_id = ec.id) as expense_count
        FROM expense_categories ec
        WHERE ec.parent_id = $1 AND ($2 = false OR ec.is_active = true)
        ORDER BY ec.name
      `
      params = [parentId, !activeOnly]
    } else {
      sql = `
        SELECT ec.*,
          (SELECT COUNT(*) FROM expenses e WHERE e.category_id = ec.id) as expense_count
        FROM expense_categories ec
        WHERE ($1 = false OR ec.is_active = true)
        ORDER BY ec.parent_id NULLS FIRST, ec.name
      `
      params = [!activeOnly]
    }

    const categories = await queryRows(sql, params)

    return categories.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      description: c.description,
      parentId: c.parent_id,
      parentName: c.parent_name || null,
      glAccount: c.gl_account,
      isBillableDefault: c.is_billable_default,
      requiresReceipt: c.requires_receipt,
      dailyLimit: c.daily_limit ? Number(c.daily_limit) : null,
      perTransactionLimit: c.per_transaction_limit ? Number(c.per_transaction_limit) : null,
      requiresApprovalAbove: c.requires_approval_above ? Number(c.requires_approval_above) : null,
      isActive: c.is_active,
      expenseCount: Number(c.expense_count) || 0,
      totalAmount: c.total_amount ? Number(c.total_amount) : null,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }))
  } catch (error) {
    console.error('Failed to fetch expense categories:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch expense categories'
    })
  }
})
