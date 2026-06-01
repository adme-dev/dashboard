import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

/**
 * POST /api/agency/social/inbox/conversations/:id/reply
 * Manual reply — resolves the target + sends via the shared dispatch helper, then records it.
 * (Target resolution: comment → latest inbound comment id; review → conversation object id.)
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const res = await dispatchReply({ queryOne, execute }, id, {
    content: content.trim(),
    sentByUserId: String(user.id),
    aiGenerated: false,
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'reply failed' })
  if (res.clientId) emitInboxEvent({ clientId: res.clientId, type: 'message.added', conversationId: id, actorId: String(user.id) }, event)
  return { ok: true, platformMessageId: res.platformMessageId }
})
