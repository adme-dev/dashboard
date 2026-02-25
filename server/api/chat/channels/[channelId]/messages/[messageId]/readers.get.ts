/**
 * Get who has read up to (and including) a specific message
 * GET /api/chat/channels/:channelId/messages/:messageId/readers
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const messageId = getRouterParam(event, 'messageId')

  if (!channelId || !messageId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID and Message ID are required' })
  }

  // Find users who have read at least up to this message
  const readers = await queryRows(`
    SELECT
      rr.user_id as "userId",
      rr.read_at as "readAt",
      tm.name as "userName",
      tm.avatar_url as "userAvatar"
    FROM chat_read_receipts rr
    JOIN team_members tm ON rr.user_id = tm.id
    WHERE rr.channel_id = $1
      AND rr.last_read_message_id >= $2
    ORDER BY rr.read_at DESC
    LIMIT 20
  `, [channelId, messageId])

  return readers
})
