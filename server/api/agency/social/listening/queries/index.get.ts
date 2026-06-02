import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/listening/queries?clientId= — list a client's listening queries. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return queryRows(
    `SELECT * FROM social_listening_queries WHERE client_id = $1 ORDER BY created_at DESC`, [clientId])
})
