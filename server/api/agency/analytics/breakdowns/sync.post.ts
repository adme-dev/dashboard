/**
 * On-demand breakdown sync for a single campaign.
 * POST /api/agency/analytics/breakdowns/sync
 * Body: { campaignId: string } (media_spend.id)
 */
import { requireAuth } from '~~/server/utils/auth'
import { syncCampaignBreakdowns } from '~~/server/utils/onDemandSync'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  if (!body?.campaignId) throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })

  return await syncCampaignBreakdowns(body.campaignId)
})
