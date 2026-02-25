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

  // Update membership read position
  await execute(`
    UPDATE chat_channel_members
    SET last_read_message_id = GREATEST(last_read_message_id, $3)
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id, messageId])

  // Upsert read receipt for read-receipt tracking
  await execute(`
    INSERT INTO chat_read_receipts (channel_id, user_id, last_read_message_id, read_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (channel_id, user_id) DO UPDATE SET
      last_read_message_id = GREATEST(chat_read_receipts.last_read_message_id, $3),
      read_at = NOW()
  `, [channelId, user.id, messageId])

  return { success: true }
})
