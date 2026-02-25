/**
 * GET /api/chat/channels/:channelId/pins
 * List pinned messages in a channel.
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

  const pins = await queryRows(`
    SELECT m.id, m.channel_id, m.user_id, m.content, m.metadata,
           m.pinned_at, m.pinned_by, m.created_at,
           tm.name AS user_name, tm.avatar_url AS user_avatar,
           pb.name AS pinned_by_name
    FROM chat_messages m
    JOIN team_members tm ON tm.id = m.user_id
    LEFT JOIN team_members pb ON pb.id = m.pinned_by
    WHERE m.channel_id = $1
      AND m.pinned_at IS NOT NULL
      AND m.deleted_at IS NULL
    ORDER BY m.pinned_at DESC
    LIMIT 50
  `, [channelId])

  return pins
})
