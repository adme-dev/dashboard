import { requireAuth } from '~~/server/utils/auth'
import { buildConversationPatchUpdate } from '~~/server/utils/socialInbox/conversationPatch'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

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
  const result = await executeSocialInboxMutation(event, 'conversation-update', async (db) => {
    const { rows } = await db.query(
      `UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING client_id`, params)
    return { id, clientId: (rows[0]?.client_id as string | undefined) ?? null, replayed: false }
  }, async (_db, ref) => ({ id: ref, clientId: null, replayed: true }))

  // Broadcast assignment/status/snooze changes (not a pure mark-read, which is per-viewer state
  // and would otherwise trigger needless refreshes / loops on other clients).
  if (result.clientId && broadcastWorthy && !result.replayed) {
    emitInboxEvent({ clientId: result.clientId, type: 'conversation.changed', conversationId: id }, event)
  }
  return { ok: true }
})
