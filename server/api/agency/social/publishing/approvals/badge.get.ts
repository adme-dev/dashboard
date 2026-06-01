import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/approvals/badge?clientId=
 * Count of posts awaiting approval (for the nav badge). clientId optional.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string | undefined
  const params: any[] = []
  let sql = `SELECT COUNT(*)::int AS count FROM social_posts
              WHERE approval_requested_at IS NOT NULL AND approved_at IS NULL
                AND status NOT IN ('cancelled','published')`
  if (clientId) {
    params.push(clientId)
    sql += ` AND client_id = $${params.length}`
  }
  const row = await queryOne<{ count: number }>(sql, params)
  return { count: row?.count ?? 0 }
})
