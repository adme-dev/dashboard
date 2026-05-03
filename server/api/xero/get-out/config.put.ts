/**
 * PUT /api/xero/get-out/config
 *
 * Replaces the tenant's Get Out config. FINANCE-gated.
 * Body: { lines: GetOutLine[] }
 *
 * Also busts the get-out KV cache so the next read picks up the new
 * targets immediately rather than waiting up to 60s.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { saveGetOutConfig, type GetOutLine, type GetOutConfig } from '~~/server/utils/getOutConfig'
import { kvDelete } from '~~/server/utils/kv'

const VALID_CATEGORIES = new Set(['wages', 'expenses', 'extras'])

function sanitiseLine(raw: any, idx: number): GetOutLine {
  const id = typeof raw?.id === 'string' && raw.id ? raw.id : `line-${Date.now()}-${idx}`
  const label = String(raw?.label ?? '').trim() || 'Untitled'
  const category = VALID_CATEGORIES.has(raw?.category) ? raw.category : 'expenses'
  // Accept either dollars-as-number or cents — UI sends cents.
  const amountCents = Number.isFinite(Number(raw?.amountCents))
    ? Math.round(Number(raw.amountCents))
    : 0
  const notes = typeof raw?.notes === 'string' ? raw.notes : null
  return { id, label, category, amountCents, notes }
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...PERMISSIONS.FINANCE])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const body = await readBody<{ lines?: any[] }>(event) ?? {}
  if (!Array.isArray(body.lines)) {
    throw createError({ statusCode: 400, statusMessage: 'lines[] required' })
  }
  if (body.lines.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Too many lines (max 100)' })
  }

  const config: GetOutConfig = {
    lines: body.lines.map((line, i) => sanitiseLine(line, i)),
  }

  await saveGetOutConfig({ tenantId, config, updatedBy: user.id })

  // Invalidate the cached calculation so the page reflects new totals
  // on the next request.
  try { await kvDelete(event, `xero-get-out:${tenantId}`) } catch { /* KV optional */ }

  return { success: true, config }
})
