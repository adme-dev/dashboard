import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

/**
 * PATCH /api/agency/social/inbox/conversations/:id
 * Update status, assignment, snooze, or mark read. Body: { status?, assigned_to?, snoozed_until?, markRead? }.
 * assigned_to: a user id, or null to unassign.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('$?', `$${params.length}`)) }

  if (body.status && ['open', 'snoozed', 'closed'].includes(body.status)) set('status = $?', body.status)
  if (body.assigned_to !== undefined) {
    set('assigned_to = $?', body.assigned_to || null)
    sets.push(`assigned_at = ${body.assigned_to ? 'NOW()' : 'NULL'}`)
  }
  if (body.snoozed_until !== undefined) set('snoozed_until = $?', body.snoozed_until || null)
  if (body.markRead === true) sets.push(`unread_count = 0`)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  const row = await queryOne<{ client_id: string }>(
    `UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING client_id`, params)

  // Broadcast assignment/status/snooze changes (not a pure mark-read, which is per-viewer state
  // and would otherwise trigger needless refreshes / loops on other clients).
  const broadcastWorthy = !!(body.status || body.assigned_to !== undefined || body.snoozed_until !== undefined)
  if (row && broadcastWorthy) {
    emitInboxEvent({ clientId: row.client_id, type: 'conversation.changed', conversationId: id }, event)
  }
  return { ok: true }
})
