import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event) || {}

  // Default: archive conversations with no activity in the last 90 days
  const olderThanDays = Math.min(Math.max(body.olderThanDays || 90, 7), 365)

  const result = await queryOne(`
    WITH archived AS (
      UPDATE ai_conversations
      SET is_archived = true, updated_at = NOW()
      WHERE user_id = $1
        AND is_archived = false
        AND COALESCE(last_message_at, created_at) < NOW() - INTERVAL '1 day' * $2
      RETURNING id
    )
    SELECT COUNT(*)::int as archived_count FROM archived
  `, [user.id, olderThanDays])

  return {
    archivedCount: result?.archived_count || 0,
    olderThanDays,
  }
})
