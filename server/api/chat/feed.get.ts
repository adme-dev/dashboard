/**
 * GET /api/chat/feed?before=<id>&limit=30
 * Cross-channel message feed — recent messages from all channels the user is a member of,
 * excluding muted channels and thread replies. Cursor-based pagination by message id.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const before = query.before ? Number(query.before) : null
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 50)

  const params: any[] = [user.id, limit]
  let beforeClause = ''
  if (before) {
    params.push(before)
    beforeClause = `AND m.id < $${params.length}`
  }

  const rows = await queryRows(`
    SELECT
      m.id,
      m.channel_id,
      m.user_id,
      LEFT(m.content, 200) AS content,
      m.metadata,
      m.created_at,
      u.name AS user_name,
      u.avatar_url AS user_avatar,
      c.name AS channel_name,
      c.slug AS channel_slug,
      c.type AS channel_type,
      c.is_private AS channel_is_private,
      (SELECT COUNT(*)::int FROM chat_messages t
       WHERE t.thread_parent_id = m.id AND t.deleted_at IS NULL) AS thread_count
    FROM chat_channel_members cm
    JOIN chat_channels c ON c.id = cm.channel_id
    JOIN chat_messages m ON m.channel_id = c.id
    LEFT JOIN team_members u ON u.id = m.user_id
    LEFT JOIN chat_channel_notification_prefs cnp
      ON cnp.channel_id = c.id AND cnp.user_id = cm.user_id
    WHERE cm.user_id = $1
      AND c.archived_at IS NULL
      AND m.deleted_at IS NULL
      AND m.thread_parent_id IS NULL
      AND COALESCE(cnp.notify_level, 'all') != 'nothing'
      AND COALESCE(cnp.muted_until, cm.muted_until, '1970-01-01'::timestamptz) < NOW()
      ${beforeClause}
    ORDER BY m.id DESC
    LIMIT $2
  `, params)

  return rows.map((r: any) => ({
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    content: r.content,
    metadata: r.metadata,
    createdAt: r.created_at,
    userName: r.user_name,
    userAvatar: r.user_avatar,
    channelName: r.channel_name,
    channelSlug: r.channel_slug,
    channelType: r.channel_type,
    channelIsPrivate: r.channel_is_private,
    threadCount: r.thread_count
  }))
})
