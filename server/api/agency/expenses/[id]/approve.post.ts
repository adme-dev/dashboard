/**
 * Approve or Reject Expense
 * POST /api/agency/expenses/:id/approve
 *
 * Body:
 * - action: 'approve' | 'reject'
 * - reason: Required if rejecting
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expense ID is required'
    })
  }

  const { action, reason } = body

  if (!action || !['approve', 'reject'].includes(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Action must be "approve" or "reject"'
    })
  }

  if (action === 'reject' && !reason) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rejection reason is required'
    })
  }

  try {
    // Check expense exists and is pending approval
    const existing = await queryOne(`
      SELECT id, user_id, status, total_amount
      FROM expenses
      WHERE id = $1
    `, [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense not found'
      })
    }

    if (!['submitted', 'pending_approval'].includes(existing.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Expense is not pending approval'
      })
    }

    // Cannot approve own expenses
    if (existing.user_id === user.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot approve your own expenses'
      })
    }

    let expense
    if (action === 'approve') {
      expense = await queryOne(`
        UPDATE expenses
        SET
          status = 'approved',
          approved_at = NOW(),
          approved_by = $2,
          rejection_reason = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, user.id])
    } else {
      expense = await queryOne(`
        UPDATE expenses
        SET
          status = 'rejected',
          rejection_reason = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, reason])
    }

    return {
      success: true,
      expense: {
        id: expense.id,
        status: expense.status,
        approvedAt: expense.approved_at,
        approvedBy: expense.approved_by,
        rejectionReason: expense.rejection_reason
      }
    }
  } catch (error: any) {
    console.error('Failed to process expense approval:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process expense approval'
    })
  }
})
