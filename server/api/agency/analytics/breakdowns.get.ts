/**
 * Analytics Breakdowns
 * GET /api/agency/analytics/breakdowns
 *
 * Query params: campaignId (media_spend.id), dimensionType? (age|gender|device|geo)
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum } from '~~/server/utils/analyticsMetrics'

const SUPPORTED_PLATFORMS = ['meta', 'google_ads', 'microsoft_ads', 'pinterest']
const VALID_DIMENSIONS = ['age', 'gender', 'device', 'geo']

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const campaignId = q.campaignId as string
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required' })
  }

  const dimensionType = q.dimensionType as string | undefined
  if (dimensionType && !VALID_DIMENSIONS.includes(dimensionType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid dimensionType' })
  }

  try {
    // Get the media_spend row to check platform
    const spend = await queryOne<{ id: string; platform: string }>(
      `SELECT id, platform FROM media_spend WHERE id = $1`,
      [campaignId]
    )

    if (!spend) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
    }

    const hasBreakdowns = SUPPORTED_PLATFORMS.includes(spend.platform)

    if (!hasBreakdowns) {
      return {
        campaignId,
        platform: spend.platform,
        breakdowns: { age: [], gender: [], device: [], geo: [] },
        hasBreakdowns: false,
      }
    }

    // Build query
    const conditions = ['sb.media_spend_id = $1']
    const params: any[] = [campaignId]
    if (dimensionType) {
      conditions.push('sb.dimension_type = $2')
      params.push(dimensionType)
    }

    const rows = await queryRows<{
      dimension_type: string
      dimension_value: string
      spend: string
      impressions: string
      clicks: string
      conversions: string
      revenue: string
    }>(`
      SELECT dimension_type, dimension_value, spend, impressions, clicks, conversions, revenue
      FROM spend_breakdowns sb
      WHERE ${conditions.join(' AND ')}
      ORDER BY dimension_type, spend DESC
    `, params)

    // Group by dimension type and compute derived metrics
    const breakdowns: Record<string, any[]> = { age: [], gender: [], device: [], geo: [] }

    for (const r of rows) {
      const spendVal = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spendVal, impressions, clicks, conversions, revenue)

      const entry = {
        dimensionValue: r.dimension_value,
        spend: spendVal,
        impressions,
        clicks,
        conversions,
        revenue,
        ctr: metrics.ctr,
        cpc: metrics.cpc,
      }

      if (breakdowns[r.dimension_type]) {
        breakdowns[r.dimension_type].push(entry)
      }
    }

    return {
      campaignId,
      platform: spend.platform,
      breakdowns,
      hasBreakdowns: true,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Analytics breakdowns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch breakdowns' })
  }
})
