/**
 * PATCH /api/chat/channels/:channelId/read
 * Mark channel as read (update last_read_message_id).
 */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const body = await readBody(event)

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  const { messageId } = body
  if (!messageId || typeof messageId !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'messageId (number) is required' })
  }

  await execute(`
    UPDATE chat_channel_members
    SET last_read_message_id = GREATEST(last_read_message_id, $3)
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id, messageId])

  return { success: true }
})
