/**
 * GET /api/chat/channels/browse
 * List public channels the current user is NOT a member of.
 * Query: ?search=<term>&limit=50&offset=0
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const search = (query.search as string)?.trim() || ''
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  let whereClause = `
    WHERE c.type = 'channel'
      AND c.is_private = false
      AND c.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM chat_channel_members cm
        WHERE cm.channel_id = c.id AND cm.user_id = $1
      )
  `
  const params: (string | number)[] = [user.id]
  let paramIdx = 2

  if (search) {
    whereClause += ` AND (c.name ILIKE $${paramIdx} OR c.description ILIKE $${paramIdx})`
    params.push(`%${search}%`)
    paramIdx++
  }

  const channels = await queryRows(`
    SELECT
      c.id, c.name, c.slug, c.description, c.type, c.is_private,
      c.created_at, c.updated_at,
      (SELECT COUNT(*)::int FROM chat_channel_members m WHERE m.channel_id = c.id) AS member_count,
      (SELECT COUNT(*)::int FROM chat_messages msg WHERE msg.channel_id = c.id AND msg.deleted_at IS NULL) AS message_count
    FROM chat_channels c
    ${whereClause}
    ORDER BY c.name ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, limit, offset])

  return channels
})
