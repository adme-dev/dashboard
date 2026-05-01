/**
 * PATCH /api/advisor/recommendations/:id
 *
 * Update a recommendation: status, assignment, due date, outcome notes,
 * client scope, priority, or the advisor copy itself. Appends an event
 * row for every mutation so the detail view has an audit trail.
 */

import { createError } from 'h3'
import { queryOne, query } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { CATEGORIES } from '~~/server/utils/advisorCategories'

const ALLOWED_STATUS = new Set(['open', 'in_progress', 'done', 'dismissed'])
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high'])
const ALLOWED_DIRECTION = new Set(['up', 'down'])
const ALLOWED_CATEGORY = new Set<string>(CATEGORIES as readonly string[])
const ALLOWED_EFFORT = new Set(['xs', 's', 'm', 'l', 'xl'])

export default eventHandler(async (event) => {
  await requireAuth(event)
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Recommendation ID required' })
  }

  const existing = await queryOne<any>(
    `SELECT id, status, assigned_to, acted_at FROM recommendations WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  )
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
  }

  const body = await readBody<any>(event) ?? {}
  const sets: string[] = []
  const params: any[] = []
  const eventPayload: Record<string, any> = {}
  let idx = 1

  function pushSet(column: string, value: any, before?: any) {
    sets.push(`${column} = $${idx}`)
    params.push(value)
    eventPayload[column] = { from: before, to: value }
    idx++
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.has(body.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
    }
    if (body.status !== existing.status) {
      pushSet('status', body.status, existing.status)
      // Auto-stamp acted_at the first time we flip to done/dismissed.
      if ((body.status === 'done' || body.status === 'dismissed') && !existing.acted_at) {
        sets.push(`acted_at = NOW()`)
      }
      // Clear acted_at if re-opening a closed rec.
      if (body.status === 'open' || body.status === 'in_progress') {
        if (existing.acted_at) sets.push(`acted_at = NULL`)
      }
    }
  }

  if (body.priority !== undefined) {
    if (!ALLOWED_PRIORITY.has(body.priority)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid priority' })
    }
    pushSet('priority', body.priority)
  }

  if (body.assigned_to !== undefined) {
    pushSet('assigned_to', body.assigned_to || null, existing.assigned_to)
  }

  if (body.client_id !== undefined) {
    pushSet('client_id', body.client_id || null)
  }

  if (body.due_date !== undefined) {
    pushSet('due_date', body.due_date || null)
  }

  if (body.outcome_notes !== undefined) {
    pushSet('outcome_notes', body.outcome_notes || null)
  }

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Title cannot be empty' })
    }
    pushSet('title', body.title.trim())
  }

  if (body.action !== undefined) {
    if (typeof body.action !== 'string' || !body.action.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Action cannot be empty' })
    }
    pushSet('action', body.action.trim())
  }

  if (body.impact !== undefined) {
    pushSet('impact', body.impact || null)
  }

  if (body.target_metric !== undefined) {
    pushSet('target_metric', body.target_metric || null)
  }

  if (body.baseline_metric_value !== undefined) {
    const v = body.baseline_metric_value
    pushSet('baseline_metric_value', v === null || v === '' ? null : Number(v))
  }

  if (body.target_direction !== undefined) {
    if (body.target_direction !== null && !ALLOWED_DIRECTION.has(body.target_direction)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid target_direction' })
    }
    pushSet('target_direction', body.target_direction || null)
  }

  if (body.category !== undefined) {
    if (body.category !== null && !ALLOWED_CATEGORY.has(body.category)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    }
    pushSet('category', body.category || null)
  }

  if (body.effort !== undefined) {
    if (body.effort !== null && !ALLOWED_EFFORT.has(body.effort)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid effort' })
    }
    pushSet('effort', body.effort || null)
  }

  if (body.snoozed_until !== undefined) {
    const v = body.snoozed_until
    if (v && typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid snoozed_until (use YYYY-MM-DD)' })
    }
    pushSet('snoozed_until', v || null)
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  params.push(id, tenantId)

  const updated = await queryOne<any>(
    `UPDATE recommendations SET ${sets.join(', ')}
     WHERE id = $${idx} AND tenant_id = $${idx + 1}
     RETURNING *`,
    params
  )

  // Audit trail — one row per mutation.
  try {
    await query(
      `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [id, 'updated', user?.id ?? null, JSON.stringify(eventPayload)]
    )
  } catch (err: any) {
    console.warn('[advisor] failed to log event:', err?.message ?? err)
  }

  return { recommendation: updated }
})
