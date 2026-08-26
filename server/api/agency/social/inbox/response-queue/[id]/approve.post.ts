import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import { recordSocialInboxApprovalEvent } from '~~/server/utils/socialInbox/clientApprovals'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

interface SocialResponseQueueApprovalRow {
  id: string
  client_id: string
  conversation_id: string
  draft_content: string
  status: string
  approver_type: string
}

interface ApproveResult { ok: true, platformMessageId?: string }

/**
 * POST /api/agency/social/inbox/response-queue/:id/approve  body { content? }
 * Staff sends either a staff-pending draft or a client-approved draft. A human send is an
 * explicit action, so it is NOT behind the autopilot master gate. Optional edited content.
 *
 * God mode: external-ledger family — the platform send is the irreversible side effect. The
 * `sending` claim below already makes a double-send impossible; the ledger additionally lets a
 * replayed owner attempt return the stored platform message id.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const clientId = body?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  return await executeSocialInboxExternalMutation<ApproveResult>(event, 'response-queue-approve', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult

    // Scope by client_id (defense-in-depth: an approval triggers a live external send).
    const row = await queryOne<SocialResponseQueueApprovalRow>(
      `SELECT * FROM social_response_queue WHERE id = $1 AND client_id = $2`, [id, clientId])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const canSendStaffPending = row.approver_type === 'staff' && row.status === 'pending'
    const canSendClientApproved = row.approver_type === 'client' && row.status === 'approved'
    const canSendPreApproved = row.approver_type === 'none' && row.status === 'approved'
    if (!canSendStaffPending && !canSendClientApproved && !canSendPreApproved) {
      throw createError({ statusCode: 409, statusMessage: `cannot send a ${row.status} ${row.approver_type} item` })
    }

    const content = String(body?.content ?? row.draft_content).trim()
    if (!content) throw createError({ statusCode: 400, statusMessage: 'empty content' })

    const claimed = await execute(
      `UPDATE social_response_queue
          SET status = 'sending',
              updated_at = NOW()
        WHERE id = $1
          AND client_id = $2
          AND (
            (approver_type = 'staff' AND status = 'pending') OR
            (approver_type = 'client' AND status = 'approved') OR
            (approver_type = 'none' AND status = 'approved')
          )`,
      [id, clientId])
    if (claimed !== 1) throw createError({ statusCode: 409, statusMessage: 'already being processed' })

    const res = await dispatchReply({ queryOne, execute }, row.conversation_id, {
      content, sentByUserId: String(user.id), aiGenerated: true
    })
    await execute(
      `UPDATE social_response_queue SET status = $2, approved_by = $3, approved_at = NOW(),
         draft_content = $4, error = $5, updated_at = NOW() WHERE id = $1`,
      [id, res.ok ? 'sent' : 'failed', String(user.id), content, res.ok ? null : (res.error ?? 'send failed')])
    await execute(
      `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
    if (res.ok) {
      await recordSocialInboxApprovalEvent({ queryOne, execute }, {
        conversationId: row.conversation_id,
        clientId,
        actorId: String(user.id),
        eventType: 'approval_reply_sent',
        content: row.approver_type === 'client'
          ? 'Staff sent the client-approved reply.'
          : 'Staff approved and sent the reply.',
        metadata: { response_queue_id: id, approver_type: row.approver_type }
      })
      emitInboxEvent({ clientId, type: 'message.added', conversationId: row.conversation_id, actorId: String(user.id) }, event)
    }
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'send failed' })
    // Checkpoint after the queue row is settled so a checkpoint failure can never strand it in 'sending'.
    await run.markDispatched()
    return { ok: true, platformMessageId: res.platformMessageId }
  })
})
