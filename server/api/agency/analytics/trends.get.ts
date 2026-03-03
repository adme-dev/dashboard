/**
 * Analytics Trends
 * GET /api/agency/analytics/trends
 *
 * Query params: startDate, endDate, metric (spend|impressions|clicks|cpc|cpm|ctr|roas),
 *               groupBy (day|week|month), clientId?, platform? (comma-separated)
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum } from '~~/server/utils/analyticsMetrics'

const VALID_METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr', 'roas'] as const
const RAW_METRICS = ['spend', 'impressions', 'clicks'] as const

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const metric = (q.metric as string) || 'spend'
  const groupBy = (q.groupBy as string) || 'day'

  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }
  if (!VALID_METRICS.includes(metric as any)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid metric. Valid: ${VALID_METRICS.join(', ')}` })
  }
  if (!['day', 'week', 'month'].includes(groupBy)) {
    throw createError({ statusCode: 400, statusMessage: 'groupBy must be day, week, or month' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null

  try {
    let rows: any[]

    if (groupBy === 'day' || groupBy === 'week') {
      // Query daily_spend joined to media_spend for platform/client filtering
      const conditions: string[] = [`ds.spend_date >= $1`, `ds.spend_date <= $2`]
      const params: any[] = [startDate, endDate]
      let idx = 3

      if (clientId) {
        conditions.push(`ms.client_id = $${idx}`)
        params.push(clientId)
        idx++
      }
      if (platforms && platforms.length > 0) {
        conditions.push(`ms.platform = ANY($${idx})`)
        params.push(platforms)
        idx++
      }

      const dateExpr = groupBy === 'week'
        ? `DATE_TRUNC('week', ds.spend_date)::date`
        : `ds.spend_date`

      rows = await queryRows(`
        SELECT
          ${dateExpr} as date,
          ms.platform,
          SUM(ds.spend) as spend,
          SUM(ds.impressions) as impressions,
          SUM(ds.clicks) as clicks,
          SUM(ds.conversions) as conversions,
          SUM(ds.revenue) as revenue
        FROM daily_spend ds
        JOIN media_spend ms ON ds.media_spend_id = ms.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${dateExpr}, ms.platform
        ORDER BY date
      `, params)
    } else {
      // groupBy === 'month' — query media_spend directly
      const conditions: string[] = [`ms.period >= $1`, `ms.period <= $2`]
      const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7)]
      let idx = 3

      if (clientId) {
        conditions.push(`ms.client_id = $${idx}`)
        params.push(clientId)
        idx++
      }
      if (platforms && platforms.length > 0) {
        conditions.push(`ms.platform = ANY($${idx})`)
        params.push(platforms)
        idx++
      }

      rows = await queryRows(`
        SELECT
          ms.period as date,
          ms.platform,
          SUM(ms.actual_spend) as spend,
          SUM(ms.impressions) as impressions,
          SUM(ms.clicks) as clicks,
          SUM(ms.conversions) as conversions,
          SUM(ms.revenue) as revenue
        FROM media_spend ms
        WHERE ${conditions.join(' AND ')}
        GROUP BY ms.period, ms.platform
        ORDER BY ms.period
      `, params)
    }

    // Group by date, then compute metrics per platform and aggregate
    const dateMap = new Map<string, { byPlatform: Map<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }> }>()

    for (const r of rows) {
      const dateKey = String(r.date).slice(0, groupBy === 'month' ? 7 : 10)
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { byPlatform: new Map() })
      }
      const entry = dateMap.get(dateKey)!
      entry.byPlatform.set(r.platform, {
        spend: toNum(r.spend),
        impressions: toNum(r.impressions),
        clicks: toNum(r.clicks),
        conversions: toNum(r.conversions),
        revenue: toNum(r.revenue),
      })
    }

    const dataPoints = Array.from(dateMap.entries()).map(([date, entry]) => {
      // Aggregate across platforms
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalRevenue = 0
      const byPlatform: Record<string, number> = {}

      for (const [platform, raw] of entry.byPlatform) {
        totalSpend += raw.spend
        totalImpressions += raw.impressions
        totalClicks += raw.clicks
        totalConversions += raw.conversions
        totalRevenue += raw.revenue

        // Get the per-platform metric value
        byPlatform[platform] = getMetricValue(metric, raw.spend, raw.impressions, raw.clicks, raw.conversions, raw.revenue)
      }

      const value = getMetricValue(metric, totalSpend, totalImpressions, totalClicks, totalConversions, totalRevenue)

      return { date, value, byPlatform }
    })

    return { metric, dataPoints }
  } catch (error) {
    console.error('Analytics trends failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics trends' })
  }
})

function getMetricValue(metric: string, spend: number, impressions: number, clicks: number, conversions: number, revenue: number): number {
  if (metric === 'spend') return spend
  if (metric === 'impressions') return impressions
  if (metric === 'clicks') return clicks

  const m = computeMetrics(spend, impressions, clicks, conversions, revenue)
  if (metric === 'cpc') return m.cpc ?? 0
  if (metric === 'cpm') return m.cpm ?? 0
  if (metric === 'ctr') return m.ctr ?? 0
  if (metric === 'roas') return m.roas ?? 0
  return 0
}
