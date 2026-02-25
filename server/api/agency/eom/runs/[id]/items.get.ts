/**
 * GET /api/agency/eom/runs/:id/items
 * Get paginated line items for an EOM run with optional filters
 */

import { createError, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
  const offset = (page - 1) * limit

  // Build WHERE clauses
  const conditions: string[] = ['run_id = $1']
  const params: any[] = [runId]
  let paramIdx = 2

  if (query.client) {
    conditions.push(`client_name ILIKE $${paramIdx}`)
    params.push(`%${query.client}%`)
    paramIdx++
  }

  if (query.coa) {
    conditions.push(`account_code = $${paramIdx}`)
    params.push(query.coa)
    paramIdx++
  }

  if (query.gst) {
    conditions.push(`tax_type = $${paramIdx}`)
    params.push(query.gst)
    paramIdx++
  }

  if (query.confidence) {
    conditions.push(`confidence = $${paramIdx}`)
    params.push(query.confidence)
    paramIdx++
  }

  if (query.reviewStatus) {
    conditions.push(`review_status = $${paramIdx}`)
    params.push(query.reviewStatus)
    paramIdx++
  }

  if (query.source) {
    conditions.push(`source = $${paramIdx}`)
    params.push(query.source)
    paramIdx++
  }

  const whereClause = conditions.join(' AND ')

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM eom_line_items WHERE ${whereClause}`,
    params,
  )
  const total = parseInt(countResult?.count || '0', 10)

  // Get items
  const items = await queryRows(
    `SELECT id, run_id, client_name, client_code, monday_item_id,
            description, quantity, unit_amount, account_code, tax_type,
            tracking_option1, invoice_number, source, confidence,
            matched_keyword, review_status, review_notes, original_values,
            created_at
     FROM eom_line_items
     WHERE ${whereClause}
     ORDER BY client_name, invoice_number, description
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset],
  )

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})
