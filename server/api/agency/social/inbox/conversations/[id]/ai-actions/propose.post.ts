import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  proposeSocialInboxAiAction,
  SocialInboxAiActionError,
  type SocialInboxAiActionInput
} from '~~/server/utils/socialInbox/aiActions'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<SocialInboxAiActionInput>(event)

  try {
    const proposal = await proposeSocialInboxAiAction({ queryOne }, id, body, String(user.id))
    const clientId = String(proposal.resolved.clientId || '')
    if (clientId) {
      emitInboxEvent({ clientId, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
    }
    return { ok: true, proposal }
  } catch (error) {
    if (error instanceof SocialInboxAiActionError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
