// server/api/ai/anomalies/[id].patch.ts
import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, transaction } from '~~/server/utils/db'

const Body = z.object({
  action: z.enum(['acknowledge', 'snooze', 'unsnooze', 'dismiss', 'resolve', 'assign', 'reopen']),
  snoozedUntil: z.string().datetime().optional(),
  resolutionNotes: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'invalid body' })
  }
  const body = parsed.data

  const row = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Anomaly not found' })

  // State-machine guard: reject transitions that are invalid for the current status.
  // The UI hides these buttons on terminal states, but the API must not trust that.
  const ALLOWED: Record<string, Set<string>> = {
    open:         new Set(['acknowledge', 'snooze', 'dismiss', 'resolve', 'assign']),
    acknowledged: new Set(['snooze', 'dismiss', 'resolve', 'assign']),
    snoozed:      new Set(['unsnooze', 'acknowledge', 'dismiss', 'resolve', 'assign']),
    resolved:     new Set(['reopen']),
    dismissed:    new Set(['reopen']),
  }
  const allowed = ALLOWED[row.status]
  if (!allowed || !allowed.has(body.action)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Action '${body.action}' not allowed on anomaly with status '${row.status}'`,
    })
  }

  await transaction(async (client) => {
    switch (body.action) {
      case 'acknowledge':
        await client.query(
          `UPDATE anomalies SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW() WHERE id = $2`,
          [user.id, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'acknowledged', $2)`,
          [id, user.id])
        break
      case 'snooze':
        if (!body.snoozedUntil) throw createError({ statusCode: 400, statusMessage: 'snoozedUntil required for snooze' })
        await client.query(
          `UPDATE anomalies SET status = 'snoozed', snoozed_until = $1 WHERE id = $2`,
          [body.snoozedUntil, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'snoozed', $2, $3)`,
          [id, user.id, JSON.stringify({ snoozedUntil: body.snoozedUntil })])
        break
      case 'unsnooze':
        await client.query(
          `UPDATE anomalies SET status = 'open', snoozed_until = NULL WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'unsnoozed', $2)`,
          [id, user.id])
        break
      case 'dismiss':
        await client.query(
          `UPDATE anomalies SET status = 'dismissed' WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'dismissed', $2, $3)`,
          [id, user.id, JSON.stringify({ reason: body.reason ?? null })])
        break
      case 'resolve':
        await client.query(
          `UPDATE anomalies SET status = 'resolved', resolved_at = NOW(), resolution_notes = $1 WHERE id = $2`,
          [body.resolutionNotes ?? null, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'resolved', $2, $3)`,
          [id, user.id, JSON.stringify({ manual: true, notes: body.resolutionNotes ?? null })])
        break
      case 'assign':
        if (!body.assigneeId) throw createError({ statusCode: 400, statusMessage: 'assigneeId required for assign' })
        await client.query(
          `UPDATE anomalies SET assignee_id = $1 WHERE id = $2`,
          [body.assigneeId, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'assigned', $2, $3)`,
          [id, user.id, JSON.stringify({ assigneeId: body.assigneeId })])
        break
      case 'reopen':
        await client.query(
          `UPDATE anomalies SET status = 'open', resolved_at = NULL, resolution_notes = NULL WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'reopened', $2)`,
          [id, user.id])
        break
    }
  })

  return { ok: true }
})
