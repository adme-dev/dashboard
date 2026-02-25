/**
 * POST /api/chat/channels/:channelId/join
 * Join a public channel. Returns the channel object.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Verify channel exists and is public
  const channel = await queryOne(`
    SELECT * FROM chat_channels
    WHERE id = $1 AND type = 'channel' AND is_private = false AND archived_at IS NULL
  `, [channelId])

  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found or is private' })
  }

  // Check if already a member
  const existing = await queryOne(`
    SELECT 1 FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (existing) {
    return channel
  }

  // Join as member
  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role)
    VALUES ($1, $2, 'member')
  `, [channelId, user.id])

  return channel
})
