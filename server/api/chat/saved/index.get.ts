/**
 * GET /api/chat/saved?limit=50&offset=0
 * List current user's saved/bookmarked messages.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  const rows = await queryRows(`
    SELECT
      s.id,
      s.message_id,
      s.channel_id,
      s.note,
      s.created_at AS saved_at,
      m.content,
      m.user_id AS message_user_id,
      m.metadata,
      m.created_at AS message_created_at,
      t.name AS message_user_name,
      t.avatar_url AS message_user_avatar,
      c.name AS channel_name,
      c.type AS channel_type,
      c.slug AS channel_slug
    FROM chat_saved_messages s
    JOIN chat_messages m ON m.id = s.message_id
    JOIN team_members t ON t.id = m.user_id
    JOIN chat_channels c ON c.id = s.channel_id
    WHERE s.user_id = $1
      AND m.deleted_at IS NULL
    ORDER BY s.created_at DESC
    LIMIT $2 OFFSET $3
  `, [user.id, limit, offset])

  return rows.map((r: any) => ({
    id: r.id,
    messageId: r.message_id,
    channelId: r.channel_id,
    note: r.note,
    savedAt: r.saved_at,
    content: r.content,
    metadata: r.metadata,
    messageUserId: r.message_user_id,
    messageUserName: r.message_user_name,
    messageUserAvatar: r.message_user_avatar,
    messageCreatedAt: r.message_created_at,
    channelName: r.channel_name,
    channelType: r.channel_type,
    channelSlug: r.channel_slug
  }))
})
