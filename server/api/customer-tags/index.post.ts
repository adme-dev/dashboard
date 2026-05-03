/**
 * POST /api/customer-tags
 *
 * Creates a new tag in the dictionary. Body: { label, color? }.
 * Labels are unique per tenant — a 409 is returned on duplicate.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

const VALID_COLORS = new Set([
  'primary', 'success', 'warning', 'error', 'info', 'neutral',
])

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const body = await readBody<{ label?: string; color?: string }>(event) ?? {}
  const label = String(body.label ?? '').trim()
  if (!label) {
    throw createError({ statusCode: 400, statusMessage: 'label is required' })
  }
  if (label.length > 60) {
    throw createError({ statusCode: 400, statusMessage: 'label must be 60 characters or fewer' })
  }
  const color = body.color && VALID_COLORS.has(body.color) ? body.color : 'neutral'

  try {
    const inserted = await queryOne<{ id: string; label: string; color: string }>(
      `INSERT INTO customer_tags (tenant_id, label, color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, label, color`,
      [tenantId, label, color, user.id],
    )
    return { tag: { ...inserted, customerCount: 0 } }
  } catch (err: any) {
    // Postgres unique_violation
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: `Tag "${label}" already exists` })
    }
    throw err
  }
})
