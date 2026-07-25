/**
 * Portal Analytics Campaign Creatives — client-scoped
 * GET /api/portal/analytics/creatives
 *
 * Query params: campaignId (media_spend.id)
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { unwrapMetaImageUrl } from '~~/server/utils/metaImage'
import { requestCampaignDetailRefresh } from '~~/server/utils/campaignDetailCache'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const q = getQuery(event)
  const campaignId = q.campaignId as string
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })
  }

  try {
    // Verify the campaign exists AND belongs to this client (3-path check)
    const spend = await queryOne<{ id: string; platform: string }>(
      `SELECT ms.id, ms.platform FROM media_spend ms WHERE ms.id = $1 AND ${buildClientCondition(2)}`,
      [campaignId, clientUser.clientId]
    )
    if (!spend) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
    }
    const supportsCreatives = ['meta', 'google_ads'].includes(spend.platform)
    const cache = supportsCreatives
      ? await requestCampaignDetailRefresh(event, campaignId, 'creatives')
      : null

    const rows = await queryRows<{
      id: string
      creative_id: string
      creative_type: string
      thumbnail_url: string | null
      title: string | null
      body: string | null
    }>(`
      SELECT id, creative_id, creative_type, thumbnail_url, title, body
      FROM campaign_creatives
      WHERE media_spend_id = $1
      ORDER BY synced_at DESC
      LIMIT 10
    `, [campaignId])

    const creatives = rows.map(r => ({
      id: r.id,
      creativeId: r.creative_id,
      type: r.creative_type,
      // Upgrade legacy stored 64x64 emg-wrapper URLs to full-res at read time.
      thumbnailUrl: unwrapMetaImageUrl(r.thumbnail_url),
      title: r.title,
      body: r.body,
    }))

    return {
      creatives,
      hasCreatives: creatives.length > 0,
      cache,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Portal analytics creatives failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch creatives' })
  }
})
