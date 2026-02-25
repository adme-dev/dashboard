import { requireRole } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'

/**
 * POST /api/agency/eom/runs/:id/sync-xero-to-board
 * After Xero push or status check, propagate Xero invoice statuses
 * back to the board's invoice_status column values.
 *
 * Body: { statuses?: Record<string, string> }
 *   - Optional map of invoice_number → xero_status (DRAFT, AUTHORISED, PAID)
 *   - If not provided, derives from run status
 */
export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const runId = getRouterParam(event, 'id')
  if (!runId) throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })

  const body = await readBody(event) || {}

  const run = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM eom_runs WHERE id = $1`,
    [runId]
  )
  if (!run) throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })

  // Get all line items with monday_item_ids
  const lineItems = await queryRows<{
    monday_item_id: string
    invoice_number: number | null
  }>(
    `SELECT monday_item_id, invoice_number
     FROM eom_line_items
     WHERE run_id = $1 AND monday_item_id IS NOT NULL`,
    [runId]
  )

  let synced = 0
  const statusMap = body.statuses || {}

  for (const item of lineItems) {
    // Determine status: from provided map, or from run status
    let boardStatus = 'in_review'
    if (item.invoice_number && statusMap[String(item.invoice_number)]) {
      const xeroStatus = statusMap[String(item.invoice_number)].toUpperCase()
      if (xeroStatus === 'PAID') boardStatus = 'paid'
      else if (xeroStatus === 'AUTHORISED') boardStatus = 'authorised'
      else boardStatus = 'draft_in_xero'
    } else if (run.status === 'pushed') {
      boardStatus = 'draft_in_xero'
    } else if (run.status === 'complete') {
      boardStatus = 'paid'
    }

    // Find task
    const task = await queryOne<{ id: string; department_id: string }>(
      `SELECT id, department_id FROM tasks WHERE monday_item_id = $1`,
      [item.monday_item_id]
    )
    if (!task) continue

    // Find invoice_status column
    const column = await queryOne<{ id: string }>(
      `SELECT id FROM custom_columns
       WHERE department_id = $1 AND column_type = 'invoice_status'
       LIMIT 1`,
      [task.department_id]
    )
    if (!column) continue

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
        boardStatus,
        JSON.stringify({
          status: boardStatus,
          runId,
          invoiceNumber: item.invoice_number,
          syncedAt: new Date().toISOString(),
        })
      ]
    )
    synced++
  }

  return { synced }
})
