import { requireAuth } from '~~/server/utils/auth'
import { confirmSocialInboxAiAction } from '~~/server/utils/socialInbox/aiActions'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

type ConfirmResult = Awaited<ReturnType<typeof confirmSocialInboxAiAction>>

/**
 * POST /api/agency/social/inbox/conversations/:id/ai-actions/confirm  body { proposalId }
 *
 * God mode: external-ledger family — the action executors create tasks / links through the AI
 * tool runtime, so the ledger checkpoints once the executor has run and replays the stored
 * result instead of executing the proposal twice.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ proposalId?: unknown }>(event)
  const proposalId = String(body.proposalId || '').trim()

  if (!proposalId) {
    throw createError({ statusCode: 400, statusMessage: 'Proposal ID required' })
  }

  return await executeSocialInboxExternalMutation<ConfirmResult>(event, 'ai-action-confirm', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult

    const result = await confirmSocialInboxAiAction({
      event,
      conversationId: id,
      proposalId,
      userId: String(user.id),
      userRole: String(user.role || '')
    })

    if (!result.ok) {
      throw createError({ statusCode: 400, statusMessage: result.error || 'Could not complete AI action' })
    }
    await run.markDispatched()

    if (result.clientId) {
      emitInboxEvent({ clientId: result.clientId, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
    }
    return result
  })
})
