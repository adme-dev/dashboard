/**
 * Mark Expense as Reimbursed
 * POST /api/agency/expenses/:id/reimburse
 *
 * Body:
 * - reference: Payment reference number
 * - paymentMethod: How reimbursement was made
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expense ID is required'
    })
  }

  const { reference, paymentMethod } = body

  try {
    // Check expense exists, is approved, and is reimbursable
    const existing = await queryOne(`
      SELECT id, status, reimbursable, reimbursed
      FROM expenses
      WHERE id = $1
    `, [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense not found'
      })
    }

    if (existing.status !== 'approved') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only approved expenses can be reimbursed'
      })
    }

    if (!existing.reimbursable) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This expense is not marked as reimbursable'
      })
    }

    if (existing.reimbursed) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This expense has already been reimbursed'
      })
    }

    const expense = await queryOne(`
      UPDATE expenses
      SET
        reimbursed = true,
        reimbursed_at = NOW(),
        reimbursement_reference = $2,
        status = 'paid',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, reference || null])

    return {
      success: true,
      expense: {
        id: expense.id,
        status: expense.status,
        reimbursed: expense.reimbursed,
        reimbursedAt: expense.reimbursed_at,
        reimbursementReference: expense.reimbursement_reference
      }
    }
  } catch (error: any) {
    console.error('Failed to process reimbursement:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process reimbursement'
    })
  }
})
