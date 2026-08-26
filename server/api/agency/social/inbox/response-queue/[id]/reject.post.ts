import { requireAuth } from '~~/server/utils/auth'
import { recordSocialInboxApprovalEvent } from '~~/server/utils/socialInbox/clientApprovals'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxMutation, socialInboxTransactionDb } from '~~/server/utils/socialInbox/godModeMutations'

interface SocialResponseQueueRejectRow {
  conversation_id: string
  status: string
  approver_type: string
}

/** POST /api/agency/social/inbox/response-queue/:id/reject */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const clientId = body?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const result = await executeSocialInboxMutation(event, 'response-queue-reject', async (client) => {
    const db = socialInboxTransactionDb(client)
    const row = await db.queryOne<SocialResponseQueueRejectRow>(
      `SELECT conversation_id, status, approver_type FROM social_response_queue WHERE id = $1 AND client_id = $2`, [id, clientId])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (row.status !== 'pending' || row.approver_type !== 'staff') {
      throw createError({ statusCode: 409, statusMessage: `cannot reject a ${row.status} ${row.approver_type} item` })
    }
    await db.execute(
      `UPDATE social_response_queue
          SET status = 'rejected',
              approved_by = $2,
              approved_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
          AND approver_type = 'staff'
          AND status = 'pending'`,
      [id, String(user.id)])
    await db.execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
    await recordSocialInboxApprovalEvent(db, {
      conversationId: row.conversation_id,
      clientId,
      actorId: String(user.id),
      eventType: 'staff_approval_rejected',
      content: 'Staff rejected the reply draft.',
      metadata: { response_queue_id: id }
    })
    return { id, conversationId: row.conversation_id, replayed: false }
  }, async (client, ref) => {
    const { rows } = await client.query(`SELECT conversation_id FROM social_response_queue WHERE id = $1`, [ref])
    return { id: ref, conversationId: (rows[0]?.conversation_id as string | undefined) ?? null, replayed: true }
  })

  if (!result.replayed && result.conversationId) {
    emitInboxEvent({ clientId, type: 'conversation.changed', conversationId: result.conversationId, actorId: String(user.id) }, event)
  }
  return { ok: true }
})
