import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { recordSocialInboxApprovalEvent } from '~~/server/utils/socialInbox/clientApprovals'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

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
  const row = await queryOne<SocialResponseQueueRejectRow>(
    `SELECT conversation_id, status, approver_type FROM social_response_queue WHERE id = $1 AND client_id = $2`, [id, clientId])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending' || row.approver_type !== 'staff') {
    throw createError({ statusCode: 409, statusMessage: `cannot reject a ${row.status} ${row.approver_type} item` })
  }
  await execute(
    `UPDATE social_response_queue
        SET status = 'rejected',
            approved_by = $2,
            approved_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND approver_type = 'staff'
        AND status = 'pending'`,
    [id, String(user.id)])
  await execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  await recordSocialInboxApprovalEvent({ queryOne, execute }, {
    conversationId: row.conversation_id,
    clientId,
    actorId: String(user.id),
    eventType: 'staff_approval_rejected',
    content: 'Staff rejected the reply draft.',
    metadata: { response_queue_id: id }
  })
  emitInboxEvent({ clientId, type: 'conversation.changed', conversationId: row.conversation_id, actorId: String(user.id) }, event)
  return { ok: true }
})
