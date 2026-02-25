/**
 * GET /api/chat/channels/:channelId
 * Get channel details with members.
 */
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  const channel = await queryOne(`
    SELECT * FROM chat_channels WHERE id = $1
  `, [channelId])

  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  const members = await queryRows(`
    SELECT cm.user_id, cm.role, cm.muted_until, cm.last_read_message_id, cm.joined_at,
           tm.name, tm.avatar_url
    FROM chat_channel_members cm
    JOIN team_members tm ON tm.id = cm.user_id
    WHERE cm.channel_id = $1
    ORDER BY cm.role = 'owner' DESC, cm.joined_at ASC
  `, [channelId])

  return { ...channel, members }
})
