import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { buildConversationPatchUpdate } from '~~/server/utils/socialInbox/conversationPatch'
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
  const { sets, params, broadcastWorthy } = buildConversationPatchUpdate(body)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  const row = await queryOne<{ client_id: string }>(
    `UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING client_id`, params)

  // Broadcast assignment/status/snooze changes (not a pure mark-read, which is per-viewer state
  // and would otherwise trigger needless refreshes / loops on other clients).
  if (row && broadcastWorthy) {
    emitInboxEvent({ clientId: row.client_id, type: 'conversation.changed', conversationId: id }, event)
  }
  return { ok: true }
})
