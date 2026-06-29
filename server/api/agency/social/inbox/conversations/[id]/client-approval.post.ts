import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import {
  requestSocialReplyClientApproval,
  SocialInboxClientApprovalError
} from '~~/server/utils/socialInbox/clientApprovals'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  try {
    const row = await transaction(async (client) => {
      const db = {
        queryOne: async <T = unknown>(sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params ?? [])
          return (result.rows?.[0] ?? null) as T | null
        },
        execute: async (sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params ?? [])
          return result.rowCount ?? 0
        }
      }
      return await requestSocialReplyClientApproval(db, id, body, String(user.id))
    })

    emitInboxEvent({ clientId: row.client_id, type: 'conversation.changed', conversationId: id, actorId: String(user.id) }, event)
    return { ok: true, approval: row }
  } catch (error) {
    if (error instanceof SocialInboxClientApprovalError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
