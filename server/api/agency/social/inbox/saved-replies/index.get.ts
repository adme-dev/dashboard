import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/saved-replies?clientId= → org-wide (client_id IS NULL) + this client's. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  return await queryRows(
    `SELECT * FROM social_saved_replies WHERE client_id IS NULL OR client_id = $1 ORDER BY category NULLS FIRST, name`,
    [clientId || null])
})
