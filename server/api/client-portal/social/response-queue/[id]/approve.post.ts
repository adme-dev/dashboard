// server/api/client-portal/social/response-queue/[id]/approve.post.ts
// A client approves a draft their automation rule routed to them → send it.
// Mirrors the agency approve path: a human approval is an explicit action, so (like a manual
// reply) it is NOT behind the autopilot master gate. The queue is structurally empty unless
// the operator has connected Meta AND enabled automation, so this stays dormant until then.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, execute, queryRows } from '~~/server/utils/db'
import { loadClientApprovable } from '~~/server/utils/socialInbox/portal'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'

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

  // Atomic claim: flip pending → sending so two concurrent approvals (double-click / script)
  // can't both pass the read-time status check and dispatch the same reply twice. The external
  // send is irreversible, so the conditional UPDATE — not the read above — is the real guard.
  const claimed = await execute(
    `UPDATE social_response_queue SET status = 'sending', updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND approver_type = 'client' AND status = 'pending'`,
    [id, client.clientId])
  if (claimed !== 1) throw createError({ statusCode: 409, statusMessage: 'already being processed' })

  const res = await dispatchReply({ queryOne, execute }, row.conversation_id, {
    content, sentByUserId: `client:${client.id}`, aiGenerated: true,
  })
  await execute(
    `UPDATE social_response_queue SET status = $2, approved_by = $3, approved_at = NOW(),
       draft_content = $4, error = $5, updated_at = NOW() WHERE id = $1`,
    [id, res.ok ? 'sent' : 'failed', `client:${client.id}`, content, res.ok ? null : (res.error ?? 'send failed')])
  await execute(
    `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'send failed' })
  return { ok: true, platformMessageId: res.platformMessageId }
})
