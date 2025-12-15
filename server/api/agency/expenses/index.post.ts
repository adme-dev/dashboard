/**
 * Create Expense
 * POST /api/agency/expenses
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const {
    categoryId,
    projectId,
    clientId,
    taskId,
    amount,
    currency = 'USD',
    taxAmount = 0,
    merchant,
    description,
    expenseDate,
    billable = false,
    paymentMethod = 'personal_card',
    reimbursable = true,
    notes,
    tags
  } = body

  if (!categoryId || !amount || !description || !expenseDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Category, amount, description, and expense date are required'
    })
  }

  try {
    // Verify category exists
    const category = await queryOne(`
      SELECT id, requires_receipt, per_transaction_limit, requires_approval_above
      FROM expense_categories
      WHERE id = $1 AND is_active = true
    `, [categoryId])

    if (!category) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense category not found'
      })
    }

    // Check per-transaction limit
    if (category.per_transaction_limit && amount > Number(category.per_transaction_limit)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Amount exceeds category limit of ${category.per_transaction_limit}`
      })
    }

    // Determine initial status
    let status = 'draft'
    if (body.submit) {
      status = 'submitted'
      // Auto-approve if below threshold and has receipt (if required)
      const needsReceipt = category.requires_receipt && amount >= 25
      const needsApproval = category.requires_approval_above && amount >= Number(category.requires_approval_above)
      if (!needsApproval && (!needsReceipt || body.hasReceipt)) {
        status = 'approved'
      } else if (status === 'submitted') {
        status = 'pending_approval'
      }
    }

    // Create expense
    const expense = await queryOne(`
      INSERT INTO expenses (
        user_id,
        category_id,
        project_id,
        client_id,
        task_id,
        amount,
        currency,
        tax_amount,
        merchant,
        description,
        expense_date,
        billable,
        payment_method,
        reimbursable,
        status,
        submitted_at,
        notes,
        tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      user.id,
      categoryId,
      projectId || null,
      clientId || null,
      taskId || null,
      amount,
      currency,
      taxAmount,
      merchant || null,
      description,
      expenseDate,
      billable,
      paymentMethod,
      reimbursable,
      status,
      status !== 'draft' ? new Date().toISOString() : null,
      notes || null,
      tags || null
    ])

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
        createdAt: expense.created_at
      }
    }
  } catch (error: any) {
    console.error('Failed to create expense:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create expense'
    })
  }
})
