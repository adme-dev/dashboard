import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/approvals?clientId=
 * Posts awaiting approval (requested, not yet approved). clientId optional.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string | undefined
  const params: any[] = []
  let sql = `SELECT * FROM social_posts
              WHERE approval_requested_at IS NOT NULL AND approved_at IS NULL
                AND status NOT IN ('cancelled','published')`
  if (clientId) {
    params.push(clientId)
    sql += ` AND client_id = $${params.length}`
  }
  sql += ` ORDER BY approval_requested_at ASC`
  return await queryRows(sql, params)
})
