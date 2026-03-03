/**
 * Analytics Campaign Creatives
 * GET /api/agency/analytics/creatives
 *
 * Query params: campaignId (media_spend.id)
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const campaignId = q.campaignId as string
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })
  }

  try {
    // Verify the campaign exists
    const spend = await queryOne<{ id: string; platform: string }>(
      `SELECT id, platform FROM media_spend WHERE id = $1`,
      [campaignId]
    )
    if (!spend) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
    }

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
      thumbnailUrl: r.thumbnail_url,
      title: r.title,
      body: r.body,
    }))

    return {
      creatives,
      hasCreatives: creatives.length > 0,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Analytics creatives failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch creatives' })
  }
})
