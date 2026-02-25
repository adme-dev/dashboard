/**
 * PATCH /api/agency/eom/runs/:id/items/:itemId
 * Update a single line item (stores original values before updating)
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')
  const itemId = getRouterParam(event, 'itemId')
  const body = await readBody(event)

  if (!runId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID and Item ID are required' })
  }

  // Verify item exists and belongs to the run
  const existing = await queryOne<{
    id: string
    unit_amount: number
    account_code: string
    tax_type: string
    client_name: string
    tracking_option1: string | null
    original_values: any
  }>(
    `SELECT id, unit_amount, account_code, tax_type, client_name,
            tracking_option1, original_values
     FROM eom_line_items WHERE id = $1 AND run_id = $2`,
    [itemId, runId],
  )

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Line item not found' })
  }

  // Store original values before first edit (preserve previous originals)
  const originalValues = existing.original_values || {
    unitAmount: existing.unit_amount,
    accountCode: existing.account_code,
    taxType: existing.tax_type,
    clientName: existing.client_name,
    trackingOption1: existing.tracking_option1,
  }

  // Build update
  const updates: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (body.unitAmount !== undefined) {
    updates.push(`unit_amount = $${paramIdx}`)
    params.push(body.unitAmount)
    paramIdx++
  }

  if (body.accountCode !== undefined) {
    updates.push(`account_code = $${paramIdx}`)
    params.push(body.accountCode)
    paramIdx++
  }

  if (body.taxType !== undefined) {
    updates.push(`tax_type = $${paramIdx}`)
    params.push(body.taxType)
    paramIdx++
  }

  if (body.clientName !== undefined) {
    updates.push(`client_name = $${paramIdx}`)
    params.push(body.clientName)
    paramIdx++
  }

  if (body.trackingOption1 !== undefined) {
    updates.push(`tracking_option1 = $${paramIdx}`)
    params.push(body.trackingOption1)
    paramIdx++
  }

  if (body.reviewNotes !== undefined) {
    updates.push(`review_notes = $${paramIdx}`)
    params.push(body.reviewNotes)
    paramIdx++
  }

  if (updates.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  // Always set review_status to corrected and store original values
  updates.push(`review_status = 'corrected'`)
  updates.push(`original_values = $${paramIdx}`)
  params.push(JSON.stringify(originalValues))
  paramIdx++

  // Add WHERE clause params
  params.push(itemId)
  params.push(runId)

  await execute(
    `UPDATE eom_line_items SET ${updates.join(', ')}
     WHERE id = $${paramIdx - 1} AND run_id = $${paramIdx}`,
    params,
  )

  // Return updated item
  const updated = await queryOne(
    `SELECT id, run_id, client_name, client_code, monday_item_id,
            description, quantity, unit_amount, account_code, tax_type,
            tracking_option1, invoice_number, source, confidence,
            matched_keyword, review_status, review_notes, original_values,
            created_at
     FROM eom_line_items WHERE id = $1`,
    [itemId],
  )

  return updated
})
