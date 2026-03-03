/**
 * On-demand breakdown sync for a single campaign (portal version).
 * POST /api/portal/analytics/breakdowns/sync
 * Body: { campaignId: string } (media_spend.id)
 */
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { syncCampaignBreakdowns } from '~~/server/utils/onDemandSync'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const body = await readBody(event)
  if (!body?.campaignId) throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })

  // Verify campaign belongs to this client (same 3-path check as GET endpoint)
  const campaign = await queryOne<{ id: string }>(
    `SELECT ms.id FROM media_spend ms WHERE ms.id = $1 AND ${buildClientCondition(2)}`,
    [body.campaignId, clientUser.clientId]
  )
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  return await syncCampaignBreakdowns(body.campaignId)
})
