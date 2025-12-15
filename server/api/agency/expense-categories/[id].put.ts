/**
 * Update Expense Category
 * PUT /api/agency/expense-categories/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateCategoryBody {
  name?: string
  code?: string
  description?: string
  parentId?: string | null
  glAccount?: string
  isBillableDefault?: boolean
  requiresReceipt?: boolean
  dailyLimit?: number | null
  perTransactionLimit?: number | null
  requiresApprovalAbove?: number | null
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateCategoryBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Category ID is required'
    })
  }

  try {
    // Check category exists
    const existing = await queryOne('SELECT * FROM expense_categories WHERE id = $1', [id])
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense category not found'
      })
    }

    // Build dynamic update
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      params.push(body.name.trim())
    }

    if (body.code !== undefined) {
      // Check for code conflicts
      const codeConflict = await queryOne(
        'SELECT id FROM expense_categories WHERE code = $1 AND id != $2',
        [body.code, id]
      )
      if (codeConflict) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A category with this code already exists'
        })
      }
      updates.push(`code = $${paramIndex++}`)
      params.push(body.code.trim())
    }

    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      params.push(body.description?.trim() || null)
    }

    if (body.parentId !== undefined) {
      // Prevent circular reference
      if (body.parentId === id) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Category cannot be its own parent'
        })
      }
      updates.push(`parent_id = $${paramIndex++}`)
      params.push(body.parentId || null)
    }

    if (body.glAccount !== undefined) {
      updates.push(`gl_account = $${paramIndex++}`)
      params.push(body.glAccount?.trim() || null)
    }

    if (body.isBillableDefault !== undefined) {
      updates.push(`is_billable_default = $${paramIndex++}`)
      params.push(body.isBillableDefault)
    }

    if (body.requiresReceipt !== undefined) {
      updates.push(`requires_receipt = $${paramIndex++}`)
      params.push(body.requiresReceipt)
    }

    if (body.dailyLimit !== undefined) {
      updates.push(`daily_limit = $${paramIndex++}`)
      params.push(body.dailyLimit)
    }

    if (body.perTransactionLimit !== undefined) {
      updates.push(`per_transaction_limit = $${paramIndex++}`)
      params.push(body.perTransactionLimit)
    }

    if (body.requiresApprovalAbove !== undefined) {
      updates.push(`requires_approval_above = $${paramIndex++}`)
      params.push(body.requiresApprovalAbove)
    }

    if (body.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      params.push(body.isActive)
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    updates.push(`updated_at = NOW()`)
    params.push(id)

    const category = await queryOne(`
      UPDATE expense_categories
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params)

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
    console.error('Failed to update expense category:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update expense category'
    })
  }
})
