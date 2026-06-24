import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { deriveLane, needsAttention } from '~~/server/utils/socialPublishing/lanes'
import type { SocialBoardPost } from '~/types'

/** GET /api/agency/social/publishing/board?clientId=&campaignId= → SocialBoardPost[] */
export default defineEventHandler(async (event): Promise<SocialBoardPost[]> => {
  await requireAuth(event)
  if (!isPlannerEnabled()) return []
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const params: any[] = [clientId]
  let where = 'p.client_id = $1'
  if (q.campaignId) { params.push(q.campaignId); where += ` AND p.campaign_id = $${params.length}` }

  const rows = await queryRows<any>(
    `SELECT p.*, c.id AS c_id, c.name AS c_name, c.color AS c_color
       FROM social_posts p
       LEFT JOIN social_campaigns c ON c.id = p.campaign_id
      WHERE ${where}
      ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC`,
    params,
  )
  return rows.map((r): SocialBoardPost => ({
    ...r,
    lane: deriveLane(r),
    needs_attention: needsAttention(r),
    campaign: r.c_id ? { id: r.c_id, name: r.c_name, color: r.c_color } : null,
  }))
})
