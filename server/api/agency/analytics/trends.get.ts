/**
 * Analytics Trends
 * GET /api/agency/analytics/trends
 *
 * Query params: startDate, endDate, metric (spend|impressions|clicks|cpc|cpm|ctr|roas|leads|costPerLead),
 *               groupBy (day|week|month), clientId?, platform? (comma-separated)
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  leadDateBucketSql,
  leadPlatformForSourceSql
} from '~~/server/utils/leads/portalAnalytics'

const VALID_METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr', 'roas', 'leads', 'costPerLead'] as const

interface TrendRaw {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  leads: number
}

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
  if (!VALID_METRICS.includes(metric as typeof VALID_METRICS[number])) {
    throw createError({ statusCode: 400, statusMessage: `Invalid metric. Valid: ${VALID_METRICS.join(', ')}` })
  }
  if (!['day', 'week', 'month'].includes(groupBy)) {
    throw createError({ statusCode: 400, statusMessage: 'groupBy must be day, week, or month' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null

  try {
    let rows: Record<string, unknown>[]

    if (groupBy === 'day' || groupBy === 'week') {
      // Query daily_spend joined to media_spend for platform/client filtering
      const conditions: string[] = [`ds.spend_date >= $1`, `ds.spend_date <= $2`]
      const params: unknown[] = [startDate, endDate]
      let idx = 3

      if (clientId) {
        conditions.push(buildClientCondition(idx))
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
          0 as revenue
        FROM daily_spend ds
        JOIN media_spend ms ON ds.media_spend_id = ms.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${dateExpr}, ms.platform
        ORDER BY date
      `, params)
    } else {
      // groupBy === 'month' — query media_spend directly
      const conditions: string[] = [`ms.period >= $1`, `ms.period <= $2`]
      const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7)]
      let idx = 3

      if (clientId) {
        conditions.push(buildClientCondition(idx))
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
          0 as revenue
        FROM media_spend ms
        WHERE ${conditions.join(' AND ')}
        GROUP BY ms.period, ms.platform
        ORDER BY ms.period
      `, params)
    }

    const leadConditions = [
      'l.deleted_at IS NULL',
      'l.submitted_at >= $1::date',
      `l.submitted_at < ($2::date + INTERVAL '1 day')`
    ]
    const leadParams: unknown[] = [startDate, endDate]
    let leadIdx = 3
    if (clientId) {
      leadConditions.push(`l.client_id = $${leadIdx}`)
      leadParams.push(clientId)
      leadIdx++
    }
    if (platforms && platforms.length > 0) {
      leadConditions.push(`${leadPlatformForSourceSql('l')} = ANY($${leadIdx})`)
      leadParams.push(platforms)
      leadIdx++
    }

    const leadDateExpr = leadDateBucketSql(groupBy)
    const leadRows = await queryRows<Record<string, unknown>>(`
      SELECT
        ${leadDateExpr} as date,
        ${leadPlatformForSourceSql('l')} as platform,
        COUNT(*)::int as leads
      FROM leads l
      WHERE ${leadConditions.join(' AND ')}
      GROUP BY ${leadDateExpr}, ${leadPlatformForSourceSql('l')}
      ORDER BY date
    `, leadParams)

    // Group by date, then compute metrics per platform and aggregate
    const dateMap = new Map<string, { byPlatform: Map<string, TrendRaw> }>()

    for (const r of rows) {
      const dateKey = String(r.date).slice(0, groupBy === 'month' ? 7 : 10)
      const platform = String(r.platform)
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { byPlatform: new Map() })
      }
      const entry = dateMap.get(dateKey)!
      entry.byPlatform.set(platform, {
        spend: toNum(r.spend),
        impressions: toNum(r.impressions),
        clicks: toNum(r.clicks),
        conversions: toNum(r.conversions),
        revenue: toNum(r.revenue),
        leads: 0
      })
    }

    for (const r of leadRows) {
      const dateKey = String(r.date).slice(0, groupBy === 'month' ? 7 : 10)
      const platform = String(r.platform)
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { byPlatform: new Map() })
      }
      const entry = dateMap.get(dateKey)!
      const current = entry.byPlatform.get(platform) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        leads: 0
      }
      entry.byPlatform.set(platform, {
        ...current,
        leads: toNum(r.leads)
      })
    }

    const dataPoints = Array.from(dateMap.entries()).map(([date, entry]) => {
      // Aggregate across platforms
      let totalSpend = 0
      let totalImpressions = 0
      let totalClicks = 0
      let totalConversions = 0
      let totalRevenue = 0
      let totalLeads = 0
      const byPlatform: Record<string, number> = {}

      for (const [platform, raw] of entry.byPlatform) {
        totalSpend += raw.spend
        totalImpressions += raw.impressions
        totalClicks += raw.clicks
        totalConversions += raw.conversions
        totalRevenue += raw.revenue
        totalLeads += raw.leads

        // Get the per-platform metric value
        byPlatform[platform] = getMetricValue(metric, raw)
      }

      const value = getMetricValue(metric, {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        leads: totalLeads
      })

      return { date, value, byPlatform }
    })

    return { metric, dataPoints }
  } catch (error) {
    console.error('Analytics trends failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics trends' })
  }
})

function getMetricValue(metric: string, raw: TrendRaw): number {
  if (metric === 'spend') return raw.spend
  if (metric === 'impressions') return raw.impressions
  if (metric === 'clicks') return raw.clicks
  if (metric === 'leads') return raw.leads
  if (metric === 'costPerLead') return raw.leads > 0 ? raw.spend / raw.leads : 0

  const m = computeMetrics(raw.spend, raw.impressions, raw.clicks, raw.conversions, raw.revenue)
  if (metric === 'cpc') return m.cpc ?? 0
  if (metric === 'cpm') return m.cpm ?? 0
  if (metric === 'ctr') return m.ctr ?? 0
  if (metric === 'roas') return m.roas ?? 0
  return 0
}
