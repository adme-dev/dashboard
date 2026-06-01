// server/api/client-portal/social/response-queue/[id]/reject.post.ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, execute, queryRows } from '~~/server/utils/db'
import { loadClientApprovable } from '~~/server/utils/socialInbox/portal'

/** POST /api/client-portal/social/response-queue/:id/reject — client declines a routed draft. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canApproveWork)
    throw createError({ statusCode: 403, statusMessage: 'Not permitted to approve responses' })

  const id = getRouterParam(event, 'id')!
  const row = await loadClientApprovable({ queryOne, execute, queryRows }, client.clientId, id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending')
    throw createError({ statusCode: 409, statusMessage: `cannot reject a ${row.status} item` })

  // Conditional on status='pending' so we never reject an item another request is mid-send on.
  const rejected = await execute(
    `UPDATE social_response_queue SET status = 'rejected', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND client_id = $3 AND approver_type = 'client' AND status = 'pending'`,
    [id, `client:${client.id}`, client.clientId])
  if (rejected !== 1) throw createError({ statusCode: 409, statusMessage: 'already being processed' })
  await execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  return { ok: true }
})
