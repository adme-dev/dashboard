/**
 * POST /api/advisor/recommendations/:id/events
 *
 * Append an event to a recommendation's audit trail. Used for
 * free-form notes, manual "outcome measured" entries, etc.
 */

import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'

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

  const exists = await queryOne<{ id: string }>(
    `SELECT id FROM recommendations WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  )
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation not found' })
  }

  const body = await readBody<{ event_type?: string; payload?: any }>(event) ?? {}
  const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : ''
  if (!eventType) {
    throw createError({ statusCode: 400, statusMessage: 'event_type required' })
  }

  const row = await queryOne<any>(
    `INSERT INTO recommendation_events (recommendation_id, event_type, actor_id, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id, event_type, actor_id, payload, created_at`,
    [id, eventType, user?.id ?? null, body.payload ? JSON.stringify(body.payload) : null]
  )

  return { event: row }
})
