import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

interface ReplyResult { ok: true, platformMessageId?: string, clientId?: string }

/**
 * POST /api/agency/social/inbox/conversations/:id/reply
 * Manual reply — resolves the target + sends via the shared dispatch helper, then records it.
 * (Target resolution: comment → latest inbound comment id; review → conversation object id.)
 *
 * God mode: external-ledger family — the platform send is the irreversible side effect, so a
 * replayed owner attempt returns the stored platform message id instead of sending twice.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const result = await executeSocialInboxExternalMutation<ReplyResult>(event, 'conversation-reply', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    const res = await dispatchReply({ queryOne, execute }, id, {
      content: content.trim(),
      sentByUserId: String(user.id),
      aiGenerated: false,
    })
    if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'reply failed' })
    await run.markDispatched()
    if (res.clientId) emitInboxEvent({ clientId: res.clientId, type: 'message.added', conversationId: id, actorId: String(user.id) }, event)
    return { ok: true, platformMessageId: res.platformMessageId, clientId: res.clientId }
  })
  return { ok: true, platformMessageId: result.platformMessageId }
})
