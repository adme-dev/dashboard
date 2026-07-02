import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/posts?clientId=&status=&limit=
 * List a client's posts, optionally filtered by status.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const limit = Math.min(Number(q.limit) || 100, 500)

  const params: any[] = [clientId]
  let sql = `SELECT * FROM social_posts WHERE client_id = $1`
  if (q.status) {
    params.push(q.status)
    sql += ` AND status = $${params.length}`
  }
  params.push(limit)
  sql += ` ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT $${params.length}`

  return await queryRows(sql, params)
})
