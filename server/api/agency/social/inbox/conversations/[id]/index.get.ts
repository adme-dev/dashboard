import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { buildSocialInboxConversationDetailQuery } from '~~/server/utils/socialInbox/conversationDetail'

/**
 * GET /api/agency/social/inbox/conversations/:id
 * Return one conversation plus its messages (oldest first).
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const detailQuery = buildSocialInboxConversationDetailQuery(id)
  const conversation = await queryOne(detailQuery.sql, detailQuery.params)
  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const messages = await queryRows(
    `SELECT * FROM social_messages WHERE conversation_id = $1
       ORDER BY platform_timestamp ASC NULLS FIRST, created_at ASC`,
    [id]
  )
  return { conversation, messages }
})
