import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/** GET /api/agency/social/publishing/campaigns?clientId= → SocialCampaignWithCounts[] */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  if (!isPlannerEnabled()) return []
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  return await queryRows(
    `SELECT c.*,
            COUNT(p.id)::int AS post_count,
            COUNT(p.id) FILTER (WHERE p.status IN ('approved','scheduled'))::int AS scheduled_count,
            COUNT(p.id) FILTER (WHERE p.status IN ('published','partially_published'))::int AS published_count
       FROM social_campaigns c
       LEFT JOIN social_posts p ON p.campaign_id = c.id
      WHERE c.client_id = $1
      GROUP BY c.id
      ORDER BY c.status, c.created_at DESC`,
    [clientId],
  )
})
