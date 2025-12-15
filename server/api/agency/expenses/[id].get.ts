/**
 * Get Expense Details
 * GET /api/agency/expenses/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Expense ID is required'
    })
  }

  try {
    // Get expense with related data
    const expense = await queryOne(`
      SELECT
        e.*,
        tm.name as user_name,
        tm.email as user_email,
        ec.name as category_name,
        ec.code as category_code,
        p.name as project_name,
        c.name as client_name,
        t.title as task_title,
        approver.name as approved_by_name
      FROM expenses e
      JOIN team_members tm ON e.user_id = tm.id
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN agency_clients c ON e.client_id = c.id
      LEFT JOIN tasks t ON e.task_id = t.id
      LEFT JOIN team_members approver ON e.approved_by = approver.id
      WHERE e.id = $1
    `, [id])

    if (!expense) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Expense not found'
      })
    }

    // Get receipts
    const receipts = await queryRows(`
      SELECT
        id,
        file_name,
        file_type,
        file_size,
        file_url,
        thumbnail_url,
        ocr_processed,
        ocr_vendor,
        ocr_amount,
        ocr_date,
        uploaded_at
      FROM expense_receipts
      WHERE expense_id = $1
      ORDER BY uploaded_at DESC
    `, [id])

    // Get expense report if linked
    const reportLink = await queryOne(`
      SELECT
        er.id,
        er.report_number,
        er.title,
        er.status
      FROM expense_report_items eri
      JOIN expense_reports er ON eri.report_id = er.id
      WHERE eri.expense_id = $1
    `, [id])

    return {
      expense: {
        id: expense.id,
        userId: expense.user_id,
        userName: expense.user_name,
        userEmail: expense.user_email,
        categoryId: expense.category_id,
        categoryName: expense.category_name,
        categoryCode: expense.category_code,
        projectId: expense.project_id,
        projectName: expense.project_name,
        clientId: expense.client_id,
        clientName: expense.client_name,
        taskId: expense.task_id,
        taskTitle: expense.task_title,
        amount: Number(expense.amount || 0),
        currency: expense.currency,
        exchangeRate: Number(expense.exchange_rate || 1),
        taxAmount: Number(expense.tax_amount || 0),
        totalAmount: Number(expense.total_amount || 0),
        merchant: expense.merchant,
        description: expense.description,
        expenseDate: expense.expense_date,
        billable: expense.billable,
        invoiced: expense.invoiced,
        invoiceId: expense.invoice_id,
        status: expense.status,
        submittedAt: expense.submitted_at,
        approvedAt: expense.approved_at,
        approvedBy: expense.approved_by,
        approvedByName: expense.approved_by_name,
        rejectionReason: expense.rejection_reason,
        paymentMethod: expense.payment_method,
        reimbursable: expense.reimbursable,
        reimbursed: expense.reimbursed,
        reimbursedAt: expense.reimbursed_at,
        reimbursementReference: expense.reimbursement_reference,
        hasReceipt: expense.has_receipt,
        receiptUrl: expense.receipt_url,
        notes: expense.notes,
        tags: expense.tags,
        externalId: expense.external_id,
        createdAt: expense.created_at,
        updatedAt: expense.updated_at
      },
      receipts: receipts.map(r => ({
        id: r.id,
        fileName: r.file_name,
        fileType: r.file_type,
        fileSize: r.file_size,
        fileUrl: r.file_url,
        thumbnailUrl: r.thumbnail_url,
        ocrProcessed: r.ocr_processed,
        ocrVendor: r.ocr_vendor,
        ocrAmount: r.ocr_amount ? Number(r.ocr_amount) : null,
        ocrDate: r.ocr_date,
        uploadedAt: r.uploaded_at
      })),
      report: reportLink ? {
        id: reportLink.id,
        reportNumber: reportLink.report_number,
        title: reportLink.title,
        status: reportLink.status
      } : null
    }
  } catch (error: any) {
    console.error('Failed to fetch expense:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch expense'
    })
  }
})
