/**
 * Update Expense
 * PUT /api/agency/expenses/:id
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

  try {
    // Check expense exists and can be edited
    const existing = await queryOne(`
      SELECT id, user_id, status
      FROM expenses
      WHERE id = $1
    `, [id])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense not found'
      })
    }

    // Only draft or rejected expenses can be edited (by the owner)
    if (!['draft', 'rejected'].includes(existing.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only draft or rejected expenses can be edited'
      })
    }

    // Build update fields
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    const allowedFields = [
      'categoryId', 'projectId', 'clientId', 'taskId',
      'amount', 'currency', 'taxAmount', 'merchant',
      'description', 'expenseDate', 'billable',
      'paymentMethod', 'reimbursable', 'notes', 'tags'
    ]

    const fieldMapping: Record<string, string> = {
      categoryId: 'category_id',
      projectId: 'project_id',
      clientId: 'client_id',
      taskId: 'task_id',
      taxAmount: 'tax_amount',
      expenseDate: 'expense_date',
      paymentMethod: 'payment_method'
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const dbField = fieldMapping[field] || field.toLowerCase()
        updates.push(`${dbField} = $${idx}`)
        params.push(body[field] === '' ? null : body[field])
        idx++
      }
    }

    // Handle submit action
    if (body.submit) {
      updates.push(`status = $${idx}`)
      params.push('submitted')
      idx++
      updates.push(`submitted_at = $${idx}`)
      params.push(new Date().toISOString())
      idx++
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    updates.push(`updated_at = $${idx}`)
    params.push(new Date().toISOString())
    idx++

    params.push(id)

    const expense = await queryOne(`
      UPDATE expenses
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    return {
      expense: {
        id: expense.id,
        userId: expense.user_id,
        categoryId: expense.category_id,
        projectId: expense.project_id,
        clientId: expense.client_id,
        amount: Number(expense.amount),
        currency: expense.currency,
        taxAmount: Number(expense.tax_amount || 0),
        totalAmount: Number(expense.total_amount || 0),
        merchant: expense.merchant,
        description: expense.description,
        expenseDate: expense.expense_date,
        billable: expense.billable,
        status: expense.status,
        paymentMethod: expense.payment_method,
        reimbursable: expense.reimbursable,
        updatedAt: expense.updated_at
      }
    }
  } catch (error: any) {
    console.error('Failed to update expense:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update expense'
    })
  }
})
