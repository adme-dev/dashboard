/**
 * GET /api/chat/channels/:channelId/messages
 * Paginated message history from Neon (for scroll-back beyond DO's recent window).
 * Query: ?before=<messageId>&after=<messageId>&limit=50&threadParentId=<id>
 *   - before: load older messages for scroll-back
 *   - after: load newer messages (for polling fallback when WS unavailable)
 */
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const query = getQuery(event)

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT 1 FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  const limit = Math.min(Number(query.limit) || 50, 100)
  const before = query.before ? Number(query.before) : null
  const after = query.after ? Number(query.after) : null
  const threadParentId = query.threadParentId ? Number(query.threadParentId) : null

  let whereClause = 'WHERE m.channel_id = $1 AND m.deleted_at IS NULL'
  const params: (string | number)[] = [channelId]
  let paramIdx = 2

  if (before) {
    whereClause += ` AND m.id < $${paramIdx}`
    params.push(before)
    paramIdx++
  }

  if (after) {
    whereClause += ` AND m.id > $${paramIdx}`
    params.push(after)
    paramIdx++
  }

  if (threadParentId) {
    whereClause += ` AND m.thread_parent_id = $${paramIdx}`
    params.push(threadParentId)
    paramIdx++
  } else {
    // Top-level messages only (no thread replies in main feed)
    whereClause += ' AND m.thread_parent_id IS NULL'
  }

  // For `after` polling, ascending order returns oldest-new-first which is what
  // the client expects to append. Otherwise default to newest-first + reverse.
  const orderBy = after ? 'ASC' : 'DESC'

  const messages = await queryRows(`
    SELECT
      m.id, m.channel_id, m.user_id, m.content, m.thread_parent_id,
      m.reply_to_id, m.edited_at, m.deleted_at, m.metadata, m.created_at,
      m.pinned_at, m.pinned_by,
      tm.name AS user_name, tm.avatar_url AS user_avatar,
      (SELECT COUNT(*)::int FROM chat_messages r
       WHERE r.thread_parent_id = m.id AND r.deleted_at IS NULL) AS thread_count
    FROM chat_messages m
    JOIN team_members tm ON tm.id = m.user_id
    ${whereClause}
    ORDER BY m.id ${orderBy}
    LIMIT $${paramIdx}
  `, [...params, limit])

  // Load reactions for these messages
  if (messages.length > 0) {
    const messageIds = messages.map((m: any) => m.id)
    const placeholders = messageIds.map((_: any, i: number) => `$${i + 1}`).join(',')

    const reactions = await queryRows(`
      SELECT message_id, emoji,
             array_agg(user_id) AS user_ids,
             COUNT(*)::int AS count
      FROM chat_reactions
      WHERE message_id IN (${placeholders})
      GROUP BY message_id, emoji
    `, messageIds)

    const reactionsMap = new Map<number, any[]>()
    for (const r of reactions as any[]) {
      if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, [])
      reactionsMap.get(r.message_id)!.push({
        emoji: r.emoji,
        user_ids: r.user_ids,
        count: r.count
      })
    }

    for (const m of messages as any[]) {
      m.reactions = reactionsMap.get(m.id) ?? []
    }
  }

  // `after` queries already arrive ASC; otherwise reverse DESC → ASC for display.
  return after ? messages : messages.reverse()
})
