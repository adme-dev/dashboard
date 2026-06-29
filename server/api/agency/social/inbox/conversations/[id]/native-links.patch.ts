import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
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
    const conversation = await transaction(async (client) => {
      const db = {
        queryOne: async <T = unknown>(sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params ?? [])
          return (result.rows?.[0] ?? null) as T | null
        }
      }
      const updated = await updateSocialInboxNativeLinks(db, id, body, String(user.id))
      if (updated) {
        await recordSocialInboxNativeLinkEvent(db, id, updated.client_id, body, String(user.id))
      }
      return updated
    })

    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }

    emitInboxEvent({ clientId: conversation.client_id, type: 'conversation.changed', conversationId: id }, event)
    return { ok: true, conversation }
  } catch (error) {
    if (error instanceof SocialInboxNativeLinkError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
