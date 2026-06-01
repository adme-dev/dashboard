import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/inbox/conversations?clientId=&channel=&platform=&status=&limit=
 * List a client's engagement conversations, newest activity first.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const params: any[] = [clientId]
  let sql = `SELECT * FROM social_conversations WHERE client_id = $1`
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status']] as const) {
    if (q[key]) { params.push(q[key]); sql += ` AND ${col} = $${params.length}` }
  }
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length}`

  return await queryRows(sql, params)
})
