/**
 * Delete Expense Category
 * DELETE /api/agency/expense-categories/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

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

    // Check for expenses using this category
    const expenses = await queryOne(
      'SELECT COUNT(*) as count FROM expenses WHERE category_id = $1',
      [id]
    )

    if (expenses && Number(expenses.count) > 0) {
      // Soft delete - deactivate instead
      await queryOne(
        'UPDATE expense_categories SET is_active = false, updated_at = NOW() WHERE id = $1',
        [id]
      )
      return {
        success: true,
        deactivated: true,
        message: `Category deactivated because it has ${expenses.count} expense(s) associated with it`
      }
    }

    // Check for child categories
    const children = await queryRows(
      'SELECT id, name FROM expense_categories WHERE parent_id = $1',
      [id]
    )

    if (children.length > 0) {
      // Orphan child categories (set parent to null)
      await queryOne(
        'UPDATE expense_categories SET parent_id = NULL WHERE parent_id = $1',
        [id]
      )
    }

    // Hard delete
    await queryOne('DELETE FROM expense_categories WHERE id = $1', [id])

    return {
      success: true,
      deleted: true,
      orphanedChildren: children.length
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete expense category:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete expense category'
    })
  }
})
