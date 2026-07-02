import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/queue?clientId=
 * Posts currently in the publishing queue, ordered by queue_position.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  return await queryRows(
    `SELECT * FROM social_posts
      WHERE client_id = $1 AND queue_position IS NOT NULL AND status IN ('draft','scheduled')
      ORDER BY queue_position ASC`,
    [clientId],
  )
})
