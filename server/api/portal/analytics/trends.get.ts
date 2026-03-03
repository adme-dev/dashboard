/**
 * Portal Analytics Trends — client-scoped
 * GET /api/portal/analytics/trends
 *
 * Query params: startDate, endDate, metric, groupBy, platform?
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, buildClientCondition } from '~~/server/utils/analyticsMetrics'

const VALID_METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr', 'roas'] as const

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const clientId = clientUser.clientId
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const metric = (q.metric as string) || 'spend'
  const groupBy = (q.groupBy as string) || 'day'

  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }
  if (!VALID_METRICS.includes(metric as any)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid metric` })
  }
  if (!['day', 'week', 'month'].includes(groupBy)) {
    throw createError({ statusCode: 400, statusMessage: 'groupBy must be day, week, or month' })
  }

  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null

  try {
    let rows: any[]

    if (groupBy === 'day' || groupBy === 'week') {
      const conditions: string[] = ['ds.spend_date >= $1', 'ds.spend_date <= $2', buildClientCondition(3)]
      const params: any[] = [startDate, endDate, clientId]
      let idx = 4
      if (platforms && platforms.length > 0) {
        conditions.push(`ms.platform = ANY($${idx})`)
        params.push(platforms)
        idx++
      }
      const dateExpr = groupBy === 'week' ? `DATE_TRUNC('week', ds.spend_date)::date` : `ds.spend_date`

      rows = await queryRows(`
        SELECT
          ${dateExpr} as date,
          ms.platform,
          SUM(ds.spend) as spend,
          SUM(ds.impressions) as impressions,
          SUM(ds.clicks) as clicks,
          SUM(ds.conversions) as conversions,
          0 as revenue
        FROM daily_spend ds
        JOIN media_spend ms ON ds.media_spend_id = ms.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${dateExpr}, ms.platform
        ORDER BY date
      `, params)
    } else {
      const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
      const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
      let idx = 4
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
          0 as revenue
        FROM media_spend ms
        WHERE ${conditions.join(' AND ')}
        GROUP BY ms.period, ms.platform
        ORDER BY ms.period
      `, params)
    }

    // Group by date
    const dateMap = new Map<string, Map<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>>()

    for (const r of rows) {
      const dateKey = String(r.date).slice(0, groupBy === 'month' ? 7 : 10)
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map())
      dateMap.get(dateKey)!.set(r.platform, {
        spend: toNum(r.spend), impressions: toNum(r.impressions), clicks: toNum(r.clicks),
        conversions: toNum(r.conversions), revenue: toNum(r.revenue),
      })
    }

    const dataPoints = Array.from(dateMap.entries()).map(([date, platMap]) => {
      let ts = 0, ti = 0, tc = 0, tco = 0, tr = 0
      const byPlatform: Record<string, number> = {}

      for (const [platform, raw] of platMap) {
        ts += raw.spend; ti += raw.impressions; tc += raw.clicks; tco += raw.conversions; tr += raw.revenue
        byPlatform[platform] = getMetricValue(metric, raw.spend, raw.impressions, raw.clicks, raw.conversions, raw.revenue)
      }

      return { date, value: getMetricValue(metric, ts, ti, tc, tco, tr), byPlatform }
    })

    return { metric, dataPoints }
  } catch (error) {
    console.error('Portal analytics trends failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch trends' })
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
