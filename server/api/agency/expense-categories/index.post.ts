/**
 * Create Expense Category
 * POST /api/agency/expense-categories
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateCategoryBody {
  name: string
  code?: string
  description?: string
  parentId?: string
  glAccount?: string
  isBillableDefault?: boolean
  requiresReceipt?: boolean
  dailyLimit?: number
  perTransactionLimit?: number
  requiresApprovalAbove?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody<CreateCategoryBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Category name is required'
    })
  }

  // Generate code from name if not provided
  const code = body.code?.trim() || body.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').substring(0, 20)

  try {
    // Check if code already exists
    const existing = await queryOne('SELECT id FROM expense_categories WHERE code = $1', [code])
    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A category with this code already exists'
      })
    }

    const category = await queryOne(`
      INSERT INTO expense_categories (
        name,
        code,
        description,
        parent_id,
        gl_account,
        is_billable_default,
        requires_receipt,
        daily_limit,
        per_transaction_limit,
        requires_approval_above
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      body.name.trim(),
      code,
      body.description?.trim() || null,
      body.parentId || null,
      body.glAccount?.trim() || null,
      body.isBillableDefault ?? false,
      body.requiresReceipt ?? true,
      body.dailyLimit || null,
      body.perTransactionLimit || null,
      body.requiresApprovalAbove || null
    ])

    return {
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      parentId: category.parent_id,
      glAccount: category.gl_account,
      isBillableDefault: category.is_billable_default,
      requiresReceipt: category.requires_receipt,
      dailyLimit: category.daily_limit ? Number(category.daily_limit) : null,
      perTransactionLimit: category.per_transaction_limit ? Number(category.per_transaction_limit) : null,
      requiresApprovalAbove: category.requires_approval_above ? Number(category.requires_approval_above) : null,
      isActive: category.is_active,
      createdAt: category.created_at,
      updatedAt: category.updated_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create expense category:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create expense category'
    })
  }
})
