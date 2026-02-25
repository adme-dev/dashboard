/**
 * GET /api/chat/status?userIds=id1,id2,id3
 * Get chat presence status for multiple users.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const userIdsParam = query.userIds as string
  if (!userIdsParam) {
    throw createError({ statusCode: 400, statusMessage: 'userIds query parameter required' })
  }

  const userIds = userIdsParam.split(',').filter(Boolean).slice(0, 100)
  if (userIds.length === 0) {
    return []
  }

  // Build parameterized IN clause
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',')

  const rows = await queryRows(`
    SELECT
      s.user_id,
      s.status,
      s.custom_text,
      s.last_seen_at,
      t.name AS user_name,
      t.avatar_url AS user_avatar
    FROM user_chat_status s
    JOIN team_members t ON t.id = s.user_id
    WHERE s.user_id IN (${placeholders})
  `, userIds)

  return rows.map((r: any) => ({
    userId: r.user_id,
    status: r.status,
    customText: r.custom_text,
    lastSeenAt: r.last_seen_at,
    userName: r.user_name,
    userAvatar: r.user_avatar
  }))
})
