/**
 * GET /api/chat/search
 * Full-text search across chat messages using tsvector.
 * Query: ?q=<search>&channelId=<optional>&limit=25&offset=0
 * Only searches channels the user is a member of.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const q = (query.q as string || '').trim()
  if (!q || q.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Search query must be at least 2 characters' })
  }

  const limit = Math.min(Number(query.limit) || 25, 50)
  const offset = Number(query.offset) || 0
  const channelId = query.channelId as string | undefined

  // Build tsquery from user input (prefix matching for partial words)
  const tsquery = q.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(' & ')

  let whereExtra = ''
  const params: (string | number)[] = [user.id, tsquery, limit, offset]
  let paramIdx = 5

  if (channelId) {
    whereExtra = ` AND m.channel_id = $${paramIdx}`
    params.push(channelId)
    paramIdx++
  }

  const results = await queryRows(`
    SELECT
      m.id, m.channel_id, m.user_id, m.content, m.thread_parent_id,
      m.created_at,
      ts_headline('english', m.content, to_tsquery('english', $2),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'
      ) AS highlight,
      ts_rank(m.search_vector, to_tsquery('english', $2)) AS rank,
      tm.name AS user_name, tm.avatar_url AS user_avatar,
      c.name AS channel_name, c.slug AS channel_slug, c.type AS channel_type
    FROM chat_messages m
    JOIN team_members tm ON tm.id = m.user_id
    JOIN chat_channels c ON c.id = m.channel_id
    WHERE m.search_vector @@ to_tsquery('english', $2)
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM chat_channel_members cm
        WHERE cm.channel_id = m.channel_id AND cm.user_id = $1
      )
      ${whereExtra}
    ORDER BY rank DESC, m.created_at DESC
    LIMIT $3 OFFSET $4
  `, params)

  return results
})
