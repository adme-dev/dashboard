import { requireAuth } from '~~/server/utils/auth'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxMutation, socialInboxTransactionDb } from '~~/server/utils/socialInbox/godModeMutations'
import {
  recordSocialInboxNativeLinkEvent,
  SocialInboxNativeLinkError,
  updateSocialInboxNativeLinks
} from '~~/server/utils/socialInbox/nativeLinks'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  try {
    const result = await executeSocialInboxMutation(event, 'conversation-native-links', async (client) => {
      const db = socialInboxTransactionDb(client)
      const updated = await updateSocialInboxNativeLinks(db, id, body, String(user.id))
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
      await recordSocialInboxNativeLinkEvent(db, id, updated.client_id, body, String(user.id))
      return { id, conversation: updated, replayed: false }
    }, async (client, ref) => {
      const { rows } = await client.query(`SELECT * FROM social_conversations WHERE id = $1`, [ref])
      if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
      return { id: ref, conversation: rows[0], replayed: true }
    })

    if (!result.replayed) {
      emitInboxEvent({ clientId: result.conversation.client_id, type: 'conversation.changed', conversationId: id }, event)
    }
    return { ok: true, conversation: result.conversation }
  } catch (error) {
    if (error instanceof SocialInboxNativeLinkError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
