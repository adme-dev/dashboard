/**
 * On-demand breakdown sync for a single campaign (portal version).
 * POST /api/portal/analytics/breakdowns/sync
 * Body: { campaignId: string } (media_spend.id)
 */
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { requestCampaignDetailRefresh } from '~~/server/utils/campaignDetailCache'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const body = await readBody(event)
  if (!body?.campaignId) throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })

  // Verify campaign belongs to this client (same 3-path check as GET endpoint)
  const campaign = await queryOne<{ id: string }>(
    `SELECT ms.id FROM media_spend ms WHERE ms.id = $1 AND ${buildClientCondition(2)}`,
    [body.campaignId, clientUser.clientId]
  )
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  const cache = await requestCampaignDetailRefresh(event, body.campaignId, 'breakdowns', { force: true })
  setResponseStatus(event, 202)
  return { status: cache.refreshing ? 'started' : cache.status, cache }
})
