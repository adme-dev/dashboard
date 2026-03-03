import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/tasks/:id/billing
 * Returns billing details for a task: EOM line items, invoice status, Xero status
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })

  // Get task with monday_item_id
  const task = await queryOne<{
    id: string
    monday_item_id: string | null
    department_id: string
    title: string
  }>(
    `SELECT id, monday_item_id, department_id, title FROM tasks WHERE id = $1`,
    [taskId]
  )
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  // Get invoice_status column value (use text cast to avoid enum validation error)
  let invoiceStatus: string | null = null
  try {
    const invoiceStatusCol = await queryOne<{ id: string }>(
      `SELECT id FROM custom_columns
       WHERE department_id = $1 AND column_type::text = 'invoice_status'
       LIMIT 1`,
      [task.department_id]
    )

    if (invoiceStatusCol) {
      const cv = await queryOne<{ text_value: string; json_value: any }>(
        `SELECT text_value, json_value FROM task_column_values
         WHERE task_id = $1 AND column_id = $2`,
        [taskId, invoiceStatusCol.id]
      )
      invoiceStatus = cv?.text_value || null
    }
  } catch (_e) {
    // invoice_status may not exist in column_type enum — skip gracefully
  }

  // Get EOM line items linked to this task (table may not exist)
  let lineItems: any[] = []
  try {
    if (task.monday_item_id) {
      lineItems = await queryRows<{
        id: string
        run_id: string
        client_name: string
        description: string
        quantity: number
        unit_amount: number
        account_code: string
        tax_type: string
        tracking_option1: string | null
        invoice_number: number | null
        source: string
        confidence: string
        review_status: string
        review_notes: string | null
        original_values: any
        created_at: string
      }>(
        `SELECT li.id, li.run_id, li.client_name, li.description,
                li.quantity, li.unit_amount, li.account_code, li.tax_type,
                li.tracking_option1, li.invoice_number, li.source, li.confidence,
                li.review_status, li.review_notes, li.original_values, li.created_at
         FROM eom_line_items li
         WHERE li.monday_item_id = $1
         ORDER BY li.created_at DESC`,
        [task.monday_item_id]
      )
    }
  } catch (_e) {
    // eom_line_items table may not exist
    lineItems = []
  }

  // Get run details for the most recent line item
  let latestRun: any = null
  try {
    if (lineItems.length > 0) {
      latestRun = await queryOne<{
        id: string
        month: number
        year: number
        status: string
        xero_batch_id: string | null
      }>(
        `SELECT id, month, year, status, xero_batch_id
         FROM eom_runs WHERE id = $1`,
        [lineItems[0].run_id]
      )
    }
  } catch (_e) {
    // eom_runs table may not exist
  }

  // Calculate totals
  const totalExGst = lineItems.reduce((sum, li) => sum + (li.unit_amount * li.quantity), 0)
  const totalGst = lineItems
    .filter(li => li.tax_type === 'GST on Income' || li.tax_type === 'GST on Expenses')
    .reduce((sum, li) => sum + (li.unit_amount * li.quantity * 0.10), 0)

  return {
    taskId,
    mondayItemId: task.monday_item_id,
    invoiceStatus,
    lineItems: lineItems.map(li => ({
      id: li.id,
      runId: li.run_id,
      clientName: li.client_name,
      description: li.description,
      quantity: li.quantity,
      unitAmount: li.unit_amount,
      accountCode: li.account_code,
      taxType: li.tax_type,
      trackingCategory: li.tracking_option1,
      invoiceNumber: li.invoice_number,
      source: li.source,
      confidence: li.confidence,
      reviewStatus: li.review_status,
      reviewNotes: li.review_notes,
      originalValues: li.original_values,
      createdAt: li.created_at,
    })),
    latestRun: latestRun ? {
      id: latestRun.id,
      month: latestRun.month,
      year: latestRun.year,
      status: latestRun.status,
      xeroBatchId: latestRun.xero_batch_id,
    } : null,
    totals: {
      exGst: totalExGst,
      gst: totalGst,
      incGst: totalExGst + totalGst,
    }
  }
})
