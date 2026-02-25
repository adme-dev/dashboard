import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

/**
 * PATCH /api/agency/tasks/:id/billing-override
 * Manual override of COA code or GST type for a task's EOM line item.
 * Captures the reason and preserves audit trail in original_values.
 *
 * Body: { lineItemId, accountCode?, taxType?, reviewNotes? }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  if (!taskId) throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })

  const body = await readBody(event)
  if (!body?.lineItemId) {
    throw createError({ statusCode: 400, statusMessage: 'lineItemId is required' })
  }

  // Verify the line item exists and belongs to this task's monday_item_id
  const task = await queryOne<{ monday_item_id: string | null }>(
    `SELECT monday_item_id FROM tasks WHERE id = $1`,
    [taskId]
  )
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  const lineItem = await queryOne<{
    id: string
    monday_item_id: string | null
    account_code: string
    tax_type: string
    original_values: any
  }>(
    `SELECT id, monday_item_id, account_code, tax_type, original_values
     FROM eom_line_items WHERE id = $1`,
    [body.lineItemId]
  )
  if (!lineItem) throw createError({ statusCode: 404, statusMessage: 'Line item not found' })

  // Verify it belongs to this task
  if (task.monday_item_id && lineItem.monday_item_id !== task.monday_item_id) {
    throw createError({ statusCode: 403, statusMessage: 'Line item does not belong to this task' })
  }

  // Build the original_values audit trail
  const existingOriginals = lineItem.original_values || {}
  const newOriginals = { ...existingOriginals }

  if (body.accountCode && body.accountCode !== lineItem.account_code) {
    newOriginals.previousAccountCode = lineItem.account_code
    newOriginals.accountCodeOverrideBy = user.name
    newOriginals.accountCodeOverrideAt = new Date().toISOString()
  }

  if (body.taxType && body.taxType !== lineItem.tax_type) {
    newOriginals.previousTaxType = lineItem.tax_type
    newOriginals.taxTypeOverrideBy = user.name
    newOriginals.taxTypeOverrideAt = new Date().toISOString()
  }

  // Update the line item
  const updates: string[] = []
  const params: any[] = [body.lineItemId]
  let idx = 2

  if (body.accountCode) {
    updates.push(`account_code = $${idx}`)
    params.push(body.accountCode)
    idx++
  }

  if (body.taxType) {
    updates.push(`tax_type = $${idx}`)
    params.push(body.taxType)
    idx++
  }

  // Always set review_status to 'corrected' and update notes + original_values
  updates.push(`review_status = 'corrected'`)
  updates.push(`confidence = 'low'`)
  updates.push(`review_notes = $${idx}`)
  params.push(body.reviewNotes || `Manual override by ${user.name}`)
  idx++

  updates.push(`original_values = $${idx}`)
  params.push(JSON.stringify(newOriginals))
  idx++

  updates.push(`updated_at = NOW()`)

  await execute(
    `UPDATE eom_line_items SET ${updates.join(', ')} WHERE id = $1`,
    params
  )

  return { updated: true, lineItemId: body.lineItemId }
})
