import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/calendar?clientId=&from=&to=
 * Posts scheduled (or published) within [from, to) for the calendar hub.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const from = (q.from as string) || new Date(Date.now() - 30 * 864e5).toISOString()
  const to = (q.to as string) || new Date(Date.now() + 60 * 864e5).toISOString()

  return await queryRows(
    `SELECT id, content, status, platforms, scheduled_at, published_at,
            (media_urls)[1] AS thumbnail
       FROM social_posts
      WHERE client_id = $1
        AND COALESCE(scheduled_at, published_at, created_at) >= $2
        AND COALESCE(scheduled_at, published_at, created_at) < $3
      ORDER BY COALESCE(scheduled_at, published_at, created_at) ASC`,
    [clientId, from, to],
  )
})
