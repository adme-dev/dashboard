import { requireAuth } from '~~/server/utils/auth'
import { confirmSocialInboxAiAction } from '~~/server/utils/socialInbox/aiActions'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ proposalId?: unknown }>(event)
  const proposalId = String(body.proposalId || '').trim()

  if (!proposalId) {
    throw createError({ statusCode: 400, statusMessage: 'Proposal ID required' })
  }

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

  if (result.clientId) {
    emitInboxEvent({ clientId: result.clientId, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
  }
  return result
})
