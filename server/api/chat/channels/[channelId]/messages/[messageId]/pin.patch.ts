/**
 * PATCH /api/chat/channels/:channelId/messages/:messageId/pin
 * Toggle pin/unpin a message. Any channel member can pin.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const messageId = getRouterParam(event, 'messageId')

  if (!channelId || !messageId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID and message ID required' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  // Get message
  const message = await queryOne(`
    SELECT id, channel_id, pinned_at FROM chat_messages
    WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL
  `, [messageId, channelId])

  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }

  if (message.pinned_at) {
    // Unpin
    const updated = await queryOne(`
      UPDATE chat_messages SET pinned_at = NULL, pinned_by = NULL
      WHERE id = $1
      RETURNING id, pinned_at
    `, [messageId])

    return { ...updated, pinned: false }
  } else {
    // Check pin limit (50 per channel)
    const count = await queryOne(`
      SELECT COUNT(*)::int AS count FROM chat_messages
      WHERE channel_id = $1 AND pinned_at IS NOT NULL AND deleted_at IS NULL
    `, [channelId])

    if (count && count.count >= 50) {
      throw createError({ statusCode: 400, statusMessage: 'Maximum 50 pinned messages per channel' })
    }

    // Pin
    const updated = await queryOne(`
      UPDATE chat_messages SET pinned_at = NOW(), pinned_by = $2
      WHERE id = $1
      RETURNING id, pinned_at, pinned_by
    `, [messageId, user.id])

    return { ...updated, pinned: true }
  }
})
