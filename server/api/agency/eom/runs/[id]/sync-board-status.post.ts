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

  // Batch-fetch all tasks by monday_item_id
  const mondayIds = lineItems.map(li => li.monday_item_id)
  const tasks = await queryRows<{ id: string; department_id: string; monday_item_id: string }>(
    `SELECT id, department_id, monday_item_id FROM tasks WHERE monday_item_id = ANY($1)`,
    [mondayIds]
  )
  const tasksByMondayId = new Map(tasks.map(t => [t.monday_item_id, t]))

  // Batch-fetch all invoice_status columns for relevant departments
  const departmentIds = [...new Set(tasks.map(t => t.department_id))]
  const columns = departmentIds.length > 0
    ? await queryRows<{ id: string; department_id: string }>(
        `SELECT id, department_id FROM custom_columns
         WHERE department_id = ANY($1) AND column_type = 'invoice_status'`,
        [departmentIds]
      )
    : []
  const columnByDept = new Map(columns.map(c => [c.department_id, c]))

  // Build batch upsert values
  const jsonValue = JSON.stringify({ status: invoiceStatus, runId, syncedAt: new Date().toISOString() })
  const upsertRows: [string, string, string, string][] = []

  for (const item of lineItems) {
    const task = tasksByMondayId.get(item.monday_item_id)
    if (!task) continue
    const column = columnByDept.get(task.department_id)
    if (!column) continue
    upsertRows.push([task.id, column.id, invoiceStatus, jsonValue])
  }

  // Single batch upsert
  let synced = 0
  if (upsertRows.length > 0) {
    const taskIds = upsertRows.map(r => r[0])
    const columnIds = upsertRows.map(r => r[1])
    const textValues = upsertRows.map(r => r[2])
    const jsonValues = upsertRows.map(r => r[3])

    const result = await execute(
      `INSERT INTO task_column_values (task_id, column_id, text_value, json_value)
       SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::text[], $4::jsonb[])
       ON CONFLICT (task_id, column_id) DO UPDATE SET
         text_value = EXCLUDED.text_value,
         json_value = EXCLUDED.json_value,
         updated_at = NOW()`,
      [taskIds, columnIds, textValues, jsonValues]
    )
    synced = upsertRows.length
  }

  return { synced, status: invoiceStatus }
})
