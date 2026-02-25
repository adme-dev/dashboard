import { requireRole } from '~~/server/utils/auth'
import { queryOne, queryRows, execute } from '~~/server/utils/db'

/**
 * POST /api/agency/boards/:id/setup-billing-automations
 * Creates pre-built billing automation recipes for a board:
 * 1. When task status → Done, set Invoice Status to "In EOM Queue"
 * 2. When Invoice Status → AUTHORISED, notify account manager
 *
 * Also creates the invoice_status column if it doesn't exist.
 */
export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })

  // Verify board exists
  const board = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM departments WHERE id = $1`,
    [boardId]
  )
  if (!board) throw createError({ statusCode: 404, statusMessage: 'Board not found' })

  // Ensure invoice_status column exists
  let invoiceCol = await queryOne<{ id: string }>(
    `SELECT id FROM custom_columns
     WHERE department_id = $1 AND column_type = 'invoice_status'`,
    [boardId]
  )

  if (!invoiceCol) {
    // Get max sort order
    const maxSort = await queryOne<{ max_sort: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM custom_columns WHERE department_id = $1`,
      [boardId]
    )

    invoiceCol = await queryOne<{ id: string }>(
      `INSERT INTO custom_columns (department_id, name, slug, column_type, description, settings, sort_order, width, created_by)
       VALUES ($1, 'Invoice Status', 'invoice_status', 'invoice_status', 'Billing status from EOM invoicing',
               $2, $3, 140, $4)
       RETURNING id`,
      [
        boardId,
        JSON.stringify({
          options: [
            { value: 'not_billed', label: 'Not Billed', color: '#C4C4C4' },
            { value: 'in_eom_queue', label: 'In EOM Queue', color: '#579BFC' },
            { value: 'in_review', label: 'In Review', color: '#FDAB3D' },
            { value: 'draft_in_xero', label: 'DRAFT in Xero', color: '#FF642E' },
            { value: 'authorised', label: 'AUTHORISED', color: '#00C875' },
            { value: 'paid', label: 'PAID', color: '#037F4C' },
          ]
        }),
        (maxSort?.max_sort || 0) + 1,
        user.id,
      ]
    )
  }

  const columnId = invoiceCol!.id
  const created: string[] = []

  // Check existing automations to avoid duplicates
  const existing = await queryRows<{ name: string }>(
    `SELECT name FROM board_automations WHERE board_id = $1`,
    [boardId]
  )
  const existingNames = new Set(existing.map(a => a.name))

  // Recipe 1: When status → Done, set Invoice Status to "In EOM Queue"
  if (!existingNames.has('Auto-flag for Billing')) {
    await execute(
      `INSERT INTO board_automations (board_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [
        boardId,
        'Auto-flag for Billing',
        'status_changed',
        JSON.stringify({ toStatus: 'Done' }),
        'update_column',
        JSON.stringify({ columnId, textValue: 'in_eom_queue' }),
        user.id,
      ]
    )
    created.push('Auto-flag for Billing')
  }

  // Recipe 2: When Invoice Status → AUTHORISED, notify account manager
  if (!existingNames.has('Notify on Invoice Authorization')) {
    await execute(
      `INSERT INTO board_automations (board_id, name, trigger_type, trigger_config, action_type, action_config, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [
        boardId,
        'Notify on Invoice Authorization',
        'column_changed',
        JSON.stringify({ columnId, value: 'authorised' }),
        'create_notification',
        JSON.stringify({
          to: 'assignee',
          title: 'Invoice Authorized',
          message: 'Invoice for {item_name} has been authorized in Xero',
        }),
        user.id,
      ]
    )
    created.push('Notify on Invoice Authorization')
  }

  return {
    columnId,
    automationsCreated: created,
    message: created.length > 0
      ? `Created ${created.length} billing automation(s)`
      : 'Billing automations already exist',
  }
})
