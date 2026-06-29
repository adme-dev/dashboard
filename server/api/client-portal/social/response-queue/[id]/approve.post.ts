// server/api/client-portal/social/response-queue/[id]/approve.post.ts
// A client approves a draft routed to them. Approval does not dispatch directly from the
// portal; the approved draft returns to the agency response queue for guarded staff send.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, execute, queryRows } from '~~/server/utils/db'
import { loadClientApprovable } from '~~/server/utils/socialInbox/portal'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { recordSocialInboxApprovalEvent } from '~~/server/utils/socialInbox/clientApprovals'

/** POST /api/client-portal/social/response-queue/:id/approve  body { content? } */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canApproveWork)
    throw createError({ statusCode: 403, statusMessage: 'Not permitted to approve responses' })

  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  const row = await loadClientApprovable({ queryOne, execute, queryRows }, client.clientId, id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending')
    throw createError({ statusCode: 409, statusMessage: `cannot approve a ${row.status} item` })

  const content = String(body?.content ?? row.draft_content).trim()
  if (!content) throw createError({ statusCode: 400, statusMessage: 'empty content' })

  const approved = await execute(
    `UPDATE social_response_queue
        SET status = 'approved',
            approved_by = $3,
            approved_at = NOW(),
            draft_content = $4,
            error = NULL,
            updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND approver_type = 'client' AND status = 'pending'`,
    [id, client.clientId, `client:${client.id}`, content])
  if (approved !== 1) throw createError({ statusCode: 409, statusMessage: 'already being processed' })

  await execute(
    `UPDATE social_conversations SET automation_state = 'client_approved_reply', updated_at = NOW() WHERE id = $1`,
    [row.conversation_id])
  await recordSocialInboxApprovalEvent({ queryOne, execute }, {
    conversationId: row.conversation_id,
    clientId: client.clientId,
    actorId: `client:${client.id}`,
    eventType: 'client_approval_approved',
    content: 'Client approved the reply draft.',
    metadata: { response_queue_id: id }
  })
  emitInboxEvent({ clientId: client.clientId, type: 'conversation.changed', conversationId: row.conversation_id, actorId: `client:${client.id}` }, event)
  return { ok: true, status: 'approved' }
})
