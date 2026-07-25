/**
 * On-demand breakdown sync for a single campaign.
 * POST /api/agency/analytics/breakdowns/sync
 * Body: { campaignId: string } (media_spend.id)
 */
import { requireAuth } from '~~/server/utils/auth'
import { syncCampaignBreakdowns } from '~~/server/utils/onDemandSync'
import { rethrowSyncConfigError } from '~~/server/utils/syncEnvGuards'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)
  if (!body?.campaignId) throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })

  try {
    return await syncCampaignBreakdowns(body.campaignId)
  } catch (error: any) {
    return rethrowSyncConfigError(error, 'Breakdown sync')
  }
})
