/**
 * List the current user's keyword subscriptions.
 * Returns lowercase keyword + creation date.
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  try {
    const rows = await queryRows(
      `SELECT id, keyword, created_at FROM keyword_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    )
    return {
      keywords: rows.map(r => ({ id: r.id, keyword: r.keyword, createdAt: r.created_at })),
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return { keywords: [] }
    }
    throw error
  }
})
