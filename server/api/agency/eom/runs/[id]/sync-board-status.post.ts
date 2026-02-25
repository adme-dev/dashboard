import { requireRole } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'

/**
 * POST /api/agency/eom/runs/:id/sync-board-status
 * After EOM generation, update "Invoice Status" column values on boards
 * for all tasks that have line items in this run.
 */
export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const runId = getRouterParam(event, 'id')
  if (!runId) throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })

  // Verify run exists
  const run = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM eom_runs WHERE id = $1`,
    [runId]
  )
  if (!run) throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })

  // Get line items that reference Monday items (which map to tasks)
  const lineItems = await queryRows<{
    monday_item_id: string
    review_status: string
  }>(
    `SELECT monday_item_id, review_status
     FROM eom_line_items
     WHERE run_id = $1 AND monday_item_id IS NOT NULL`,
    [runId]
  )

  if (lineItems.length === 0) {
    return { synced: 0, message: 'No Monday-sourced line items to sync' }
  }

  // Determine the invoice status based on run status
  let invoiceStatus = 'in_review'
  if (run.status === 'pushed') invoiceStatus = 'draft_in_xero'
  else if (run.status === 'complete') invoiceStatus = 'paid'

  let synced = 0

  for (const item of lineItems) {
    // Find the task by monday_item_id
    const task = await queryOne<{ id: string; department_id: string }>(
      `SELECT id, department_id FROM tasks WHERE monday_item_id = $1`,
      [item.monday_item_id]
    )
    if (!task) continue

    // Find invoice_status column for this board
    const column = await queryOne<{ id: string }>(
      `SELECT id FROM custom_columns
       WHERE department_id = $1 AND column_type = 'invoice_status'
       LIMIT 1`,
      [task.department_id]
    )
    if (!column) continue

    // Upsert the column value
    await execute(
      `INSERT INTO task_column_values (task_id, column_id, text_value, json_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (task_id, column_id) DO UPDATE SET
         text_value = $3,
         json_value = $4,
         updated_at = NOW()`,
      [
        task.id,
        column.id,
        invoiceStatus,
        JSON.stringify({ status: invoiceStatus, runId, syncedAt: new Date().toISOString() })
      ]
    )
    synced++
  }

  return { synced, status: invoiceStatus }
})
