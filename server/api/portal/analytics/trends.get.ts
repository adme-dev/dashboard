/**
 * Portal Analytics Trends — client-scoped
 * GET /api/portal/analytics/trends
 *
 * Query params: startDate, endDate, metric, groupBy, platform?, runningOnly
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, buildClientCondition, toDateOnly } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_VISIBLE_LEADS_EXISTS,
  leadDateBucketSql,
  leadPlatformForSourceSql
} from '~~/server/utils/leads/portalAnalytics'

const VALID_METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr', 'roas', 'leads', 'costPerLead'] as const

function normalizePlatform(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (value === 'google') {
    return 'google_ads'
  }
  if (value === 'meta_ads' || value === 'facebook' || value === 'instagram' || value === 'fb') {
    return 'meta'
  }
  return value
}

function normalizePlatformList(values: string[] | null): string[] | null {
  if (!values || values.length === 0) return null
  const normalized = values
    .map((value) => normalizePlatform(value))
    .map((value) => value.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized : null
}

type TrendResolution = 'day' | 'week' | 'month'

interface TrendRaw {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  leads: number
}

interface TrendRow {
  date: string
  platform: string
  spend: unknown
  impressions: unknown
  clicks: unknown
  conversions: unknown
  revenue: unknown
}

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
  const runningOnly = String(q.runningOnly || '').toLowerCase() === '1'
    || String(q.runningOnly || '').toLowerCase() === 'true'

  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }
  if (!VALID_METRICS.includes(metric as typeof VALID_METRICS[number])) {
    throw createError({ statusCode: 400, statusMessage: `Invalid metric` })
  }
  if (!['day', 'week', 'month'].includes(groupBy)) {
    throw createError({ statusCode: 400, statusMessage: 'groupBy must be day, week, or month' })
  }

  const platforms = normalizePlatformList(
    q.platform ? String(q.platform).split(',').map((p) => p.trim()).filter(Boolean) : null
  )
  const explicitPlatforms = platforms && platforms.length > 0
  let effectivePlatforms = explicitPlatforms ? [...platforms] : null
  if (runningOnly && !explicitPlatforms) {
    const hasMetaCampaigns = await queryOne<{ hasMetaCampaigns: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM media_spend ms
        WHERE ms.platform = 'meta'
          AND ms.period >= $1
          AND ms.period <= $2
          AND ${buildClientCondition(3)}
      ) AS "hasMetaCampaigns"
    `, [startDate.slice(0, 7), endDate.slice(0, 7), clientId])

    effectivePlatforms = ['google_ads']
    if (hasMetaCampaigns?.hasMetaCampaigns) {
      effectivePlatforms.push('meta')
    }
  }
  if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
    const normalized = effectivePlatforms.map((p) => p.trim()).filter(Boolean)
    if (normalized.length > 0) {
      effectivePlatforms.splice(0, effectivePlatforms.length, ...normalized)
    }
  }

  const leadPlatforms = effectivePlatforms
    ?.map((p) => (p === 'google_ads' ? 'google' : p === 'meta' ? 'meta' : null))
    .filter((p): boolean => Boolean(p))
    .map((p) => p as string)

  try {
    let rows: TrendRow[] = []
    let usedMonthlyFallback = false

    const monthWhere: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
    const monthParams: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
    let monthIdx = 4
    if (effectivePlatforms && effectivePlatforms.length > 0) {
      monthWhere.push(`ms.platform = ANY($${monthIdx})`)
      monthParams.push(effectivePlatforms)
      monthIdx++
    }
    if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
      monthParams.push(['ACTIVE', 'ENABLED', 'DELIVERING', 'RUNNING'].map((s) => s.toUpperCase()))
      monthWhere.push(`(
        (ms.end_date IS NULL OR ms.end_date >= CURRENT_DATE)
        AND (
          ms.campaign_status IS NULL
          OR UPPER(ms.campaign_status) = ANY($${monthIdx}::text[])
        )
      )`)
      monthIdx++
    }

    const missingDailyData = groupBy === 'day' || groupBy === 'week'

    if (missingDailyData) {
      const conditions: string[] = ['ds.spend_date >= $1', 'ds.spend_date <= $2', buildClientCondition(3)]
      const params: unknown[] = [startDate, endDate, clientId]
      let idx = 4
      if (effectivePlatforms && effectivePlatforms.length > 0) {
        conditions.push(`ms.platform = ANY($${idx})`)
        params.push(effectivePlatforms)
        idx++
      }
      if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
        params.push(['ACTIVE', 'ENABLED', 'DELIVERING', 'RUNNING'].map((s) => s.toUpperCase()))
        conditions.push(`(
          (ms.end_date IS NULL OR ms.end_date >= CURRENT_DATE)
          AND (
            ms.campaign_status IS NULL
            OR UPPER(ms.campaign_status) = ANY($${idx}::text[])
          )
        )`)
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
      const hasPositiveSpend = metric === 'spend'
        ? rows.some((r) => toNum(r.spend) > 0)
        : true

      if (rows.length === 0 || !hasPositiveSpend) {
        const fallbackMonthRows = await queryRows<{
          date: string
          platform: string
          spend: string
          impressions: string
          clicks: string
          conversions: string
          revenue: string
        }>(`
          SELECT
            TO_DATE(ms.period || '-01', 'YYYY-MM-DD') as date,
            ms.platform,
            COALESCE(SUM(ms.actual_spend), 0) as spend,
            COALESCE(SUM(ms.impressions), 0) as impressions,
            COALESCE(SUM(ms.clicks), 0) as clicks,
            COALESCE(SUM(ms.conversions), 0) as conversions,
            COALESCE(SUM(ms.revenue), 0) as revenue
          FROM media_spend ms
          WHERE ${monthWhere.join(' AND ')}
          GROUP BY ms.period, ms.platform
          ORDER BY ms.period
        `, monthParams)

        usedMonthlyFallback = true
        rows = fallbackMonthRows.map((row) => ({
          date: row.date,
          platform: row.platform,
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
          revenue: row.revenue
        }))
      }
    } else {
      const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
      const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
      let idx = 4
      if (effectivePlatforms && effectivePlatforms.length > 0) {
        conditions.push(`ms.platform = ANY($${idx})`)
        params.push(effectivePlatforms)
        idx++
      }
      if (runningOnly && effectivePlatforms && effectivePlatforms.length > 0) {
        params.push(['ACTIVE', 'ENABLED', 'DELIVERING', 'RUNNING'].map((s) => s.toUpperCase()))
        conditions.push(`(
          (ms.end_date IS NULL OR ms.end_date >= CURRENT_DATE)
          AND (
            ms.campaign_status IS NULL
            OR UPPER(ms.campaign_status) = ANY($${idx}::text[])
          )
        )`)
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

    const trendGroupBy: TrendResolution = usedMonthlyFallback && (groupBy === 'day' || groupBy === 'week')
      ? 'month'
      : (groupBy as TrendResolution)
    const leadConditions = [
      'l.client_id = $1',
      'l.deleted_at IS NULL',
      'l.submitted_at >= $2::date',
      `l.submitted_at < ($3::date + INTERVAL '1 day')`,
      PORTAL_VISIBLE_LEADS_EXISTS
    ]
    const leadParams: unknown[] = [clientId, startDate, endDate]
    if (leadPlatforms && leadPlatforms.length > 0) {
      leadConditions.push('l.source = ANY($4)')
      leadParams.push(leadPlatforms)
    } else if (platforms && platforms.length > 0) {
      leadConditions.push(`${leadPlatformForSourceSql('l')} = ANY($4)`)
      leadParams.push(platforms)
    }
    const leadDateExpr = leadDateBucketSql(trendGroupBy)
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

    // Group by date
    const dateMap = new Map<string, Map<string, TrendRaw>>()

    for (const r of rows) {
      const dateKey = normalizeTrendDate(r.date, trendGroupBy)
      if (!dateKey) continue
      const platform = String(r.platform)
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map())
      dateMap.get(dateKey)!.set(platform, {
        spend: toNum(r.spend), impressions: toNum(r.impressions), clicks: toNum(r.clicks),
        conversions: toNum(r.conversions), revenue: toNum(r.revenue), leads: 0
      })
    }

    for (const r of leadRows) {
      const dateKey = normalizeTrendDate(r.date, trendGroupBy)
      if (!dateKey) continue
      const platform = String(r.platform)
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map())
      const platformMap = dateMap.get(dateKey)!
      const current = platformMap.get(platform) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        leads: 0
      }
      platformMap.set(platform, {
        ...current,
        leads: toNum(r.leads)
      })
    }

    const orderedEntries = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))

    let dataPoints = orderedEntries.map(([date, platMap]) => {
      let ts = 0, ti = 0, tc = 0, tco = 0, tr = 0, tl = 0
      const byPlatform: Record<string, number> = {}

      for (const [platform, raw] of platMap) {
        ts += raw.spend
        ti += raw.impressions
        tc += raw.clicks
        tco += raw.conversions
        tr += raw.revenue
        tl += raw.leads
        byPlatform[platform] = getMetricValue(metric, raw)
      }

      return {
        date,
        value: getMetricValue(metric, {
          spend: ts,
          impressions: ti,
          clicks: tc,
          conversions: tco,
          revenue: tr,
          leads: tl
        }),
        byPlatform
      }
    })

    if (trendGroupBy === 'month') {
      const monthSeries = generateMonthSeries(startDate.slice(0, 7), endDate.slice(0, 7))
      const byDate = new Map(dataPoints.map((dp) => [dp.date, dp]))
      dataPoints = monthSeries.map((date) => byDate.get(date) ?? {
        date,
        value: 0,
        byPlatform: {}
      })
    } else if (groupBy === 'day' && !usedMonthlyFallback) {
      const daySeries = generateDateSeries(startDate, endDate)
      const byDate = new Map(dataPoints.map((dp) => [dp.date, dp]))
      dataPoints = daySeries.map((date) => byDate.get(date) ?? {
        date,
        value: 0,
        byPlatform: {}
      })
    }

    return {
      metric,
      dataPoints,
      resolution: trendGroupBy
    }
  } catch (error) {
    console.error('Portal analytics trends failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch trends' })
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

function normalizeTrendDate(value: unknown, groupBy: string): string | null {
  const parsed = toDateOnly(value)
  if (!parsed) return null

  if (groupBy === 'week') {
    const weekStart = toWeekStartDate(parsed)
    return weekStart ? toIsoDate(weekStart) : null
  }

  return parsed.slice(0, groupBy === 'month' ? 7 : 10)
}

function toWeekStartDate(date: string): Date | null {
  const dt = new Date(`${date}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null

  const dow = dt.getDay()
  const delta = dow === 0 ? -6 : -(dow - 1)
  const monday = new Date(dt)
  monday.setDate(dt.getDate() + delta)
  return monday
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toIsoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function generateDateSeries(start: string, end: string): string[] {
  const out: string[] = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    out.push(toIsoDate(current))
  }
  return out
}

function generateMonthSeries(start: string, end: string): string[] {
  const out: string[] = []
  const startDate = new Date(`${start}-01T00:00:00`)
  const endDate = new Date(`${end}-01T00:00:00`)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return out
  }

  for (let current = new Date(startDate); current <= endDate; current = addMonths(current, 1)) {
    out.push(toIsoMonth(current))
  }

  return out
}

function addMonths(d: Date, n: number): Date {
  const next = new Date(d)
  next.setMonth(d.getMonth() + n)
  return next
}
