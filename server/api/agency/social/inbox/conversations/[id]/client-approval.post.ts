import { requireAuth } from '~~/server/utils/auth'
import {
  requestSocialReplyClientApproval,
  SocialInboxClientApprovalError
} from '~~/server/utils/socialInbox/clientApprovals'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxMutation, socialInboxTransactionDb } from '~~/server/utils/socialInbox/godModeMutations'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  try {
    const result = await executeSocialInboxMutation(event, 'conversation-client-approval', async (client) => {
      const row = await requestSocialReplyClientApproval(socialInboxTransactionDb(client), id, body, String(user.id))
      return { id: String(row.id), approval: row, replayed: false }
    }, async (client, ref) => {
      const { rows } = await client.query(`SELECT * FROM social_response_queue WHERE id = $1`, [ref])
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Approval request not found' })
      return { id: ref, approval: rows[0], replayed: true }
    })

    if (!result.replayed) {
      emitInboxEvent({ clientId: result.approval.client_id, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
    }
    return { ok: true, approval: result.approval }
  } catch (error) {
    if (error instanceof SocialInboxClientApprovalError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
