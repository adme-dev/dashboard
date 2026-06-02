// server/api/agency/social/listening/overview.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildListeningOverview, type MentionRow } from '~~/server/utils/socialListening/analytics'

/** GET /api/agency/social/listening/overview?clientId=&days= — aggregated listening analytics. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)

  const rows = await queryRows<MentionRow>(
    `SELECT m.source, m.sentiment, m.topics, m.published_at, q.category
       FROM social_listening_mentions m
       LEFT JOIN social_listening_queries q ON q.id = m.query_id
      WHERE m.client_id = $1
        AND COALESCE(m.published_at, m.created_at) > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days])
  return buildListeningOverview(rows)
})
