import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
]
const OTHER_COLOR = '#9ca3af'

/**
 * GET /api/agency/social/campaign-daily-spend?platform=meta|google&month=X&year=Y[&connectionId=UUID]
 * Returns per-campaign daily spend series + aggregated totals.
 * When connectionId is provided, returns ALL campaigns for that account (no limit).
 * Otherwise returns global top 10 + "Other" bucket.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const platform = query.platform as string
  if (!platform || !['meta', 'google'].includes(platform)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid platform' })
  }

  const now = new Date()
  const month = Number(query.month) || now.getMonth() + 1
  const year = Number(query.year) || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`
  const dbPlatform = platform === 'google' ? 'google_ads' : 'meta'
  const connectionId = query.connectionId as string | undefined

  // Cache global requests (no connectionId) for 5 minutes
  const cacheKey = connectionId
    ? null
    : `spend:daily:${platform}:${period}`

  const fetcher = async () => {
  // 1. Get campaigns — scoped to connection or global top 10
  const topCampaigns = connectionId
    ? await queryRows<{
        id: string
        campaign_id: string
        campaign_name: string
        campaign_type: string | null
        campaign_status: string | null
        actual_spend: string
        budget_allocated: string
        impressions: string
        clicks: string
      }>(
        `SELECT ms.id, ms.campaign_id, ms.campaign_name,
                ms.campaign_type, ms.campaign_status,
                ms.actual_spend::text, ms.budget_allocated::text,
                COALESCE(ms.impressions, 0)::text as impressions,
                COALESCE(ms.clicks, 0)::text as clicks
         FROM media_spend ms
         JOIN social_connections sc ON sc.id = ms.connection_id
         WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'
           AND ms.connection_id = $3
         ORDER BY ms.actual_spend DESC`,
        [dbPlatform, period, connectionId]
      )
    : await queryRows<{
        id: string
        campaign_id: string
        campaign_name: string
        campaign_type: string | null
        campaign_status: string | null
        actual_spend: string
        budget_allocated: string
        impressions: string
        clicks: string
      }>(
        `SELECT ms.id, ms.campaign_id, ms.campaign_name,
                ms.campaign_type, ms.campaign_status,
                ms.actual_spend::text, ms.budget_allocated::text,
                COALESCE(ms.impressions, 0)::text as impressions,
                COALESCE(ms.clicks, 0)::text as clicks
         FROM media_spend ms
         JOIN social_connections sc ON sc.id = ms.connection_id
         WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'
         ORDER BY ms.actual_spend DESC
         LIMIT 10`,
        [dbPlatform, period]
      )

  // 2. Check if there are more campaigns beyond top 10 (global mode only)
  let hasOther = false
  if (!connectionId) {
    const totalCount = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text as cnt
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
       WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'`,
      [dbPlatform, period]
    )
    hasOther = parseInt(totalCount?.cnt || '0', 10) > 10
  }

  // 3. Fetch daily_spend for campaigns
  const topIds = topCampaigns.map(c => c.id)

  let dailyByMediaSpend: Record<string, { date: string; spend: number; impressions: number; clicks: number }[]> = {}

  if (topIds.length > 0) {
    const placeholders = topIds.map((_, i) => `$${i + 1}`).join(',')
    const dailyRows = await queryRows<{
      media_spend_id: string
      spend_date: string
      spend: string
      impressions: string
      clicks: string
    }>(
      `SELECT ds.media_spend_id, ds.spend_date::text as spend_date,
              ds.spend::text, ds.impressions::text, ds.clicks::text
       FROM daily_spend ds
       WHERE ds.media_spend_id IN (${placeholders})
       ORDER BY ds.spend_date`,
      topIds
    )

    for (const row of dailyRows) {
      if (!dailyByMediaSpend[row.media_spend_id]) {
        dailyByMediaSpend[row.media_spend_id] = []
      }
      dailyByMediaSpend[row.media_spend_id]!.push({
        date: row.spend_date,
        spend: parseFloat(row.spend),
        impressions: parseInt(row.impressions, 10),
        clicks: parseInt(row.clicks, 10),
      })
    }
  }

  // 4. Build campaign series
  // Generate date range for the month (used as fallback when daily_spend is empty)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const lastDay = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth
  const allDates: string[] = []
  for (let d = 1; d <= lastDay; d++) {
    allDates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  let usedEstimatedFallback = false

  const campaigns = topCampaigns.map((c, i) => {
    let daily = dailyByMediaSpend[c.id] || []

    // Fallback: if no daily data but has monthly spend, estimate flat daily distribution
    if (daily.length === 0 && parseFloat(c.actual_spend) > 0) {
      usedEstimatedFallback = true
      const monthlySpend = parseFloat(c.actual_spend)
      const monthlyImpressions = parseInt(c.impressions || '0', 10)
      const monthlyClicks = parseInt(c.clicks || '0', 10)
      const dailySpend = monthlySpend / lastDay
      const dailyImpressions = Math.round(monthlyImpressions / lastDay)
      const dailyClicks = Math.round(monthlyClicks / lastDay)
      daily = allDates.map(date => ({
        date,
        spend: Math.round(dailySpend * 100) / 100,
        impressions: dailyImpressions,
        clicks: dailyClicks,
      }))
    }

    return {
      campaignId: c.campaign_id || c.id,
      campaignName: c.campaign_name || 'Unnamed Campaign',
      campaignType: c.campaign_type,
      status: c.campaign_status,
      monthlySpend: parseFloat(c.actual_spend),
      monthlyBudget: parseFloat(c.budget_allocated),
      color: PALETTE[i] || PALETTE[i % PALETTE.length],
      daily,
    }
  })

  // 5. "Other" bucket — if >10 campaigns (global mode only), aggregate the rest
  if (hasOther && !connectionId && topIds.length > 0) {
    const placeholders = topIds.map((_, i) => `$${i + 3}`).join(',')
    const otherDaily = await queryRows<{
      spend_date: string
      total_spend: string
      total_impressions: string
      total_clicks: string
    }>(
      `SELECT ds.spend_date::text as spend_date,
              SUM(ds.spend)::text as total_spend,
              SUM(ds.impressions)::text as total_impressions,
              SUM(ds.clicks)::text as total_clicks
       FROM daily_spend ds
       JOIN media_spend ms ON ms.id = ds.media_spend_id
       JOIN social_connections sc ON sc.id = ms.connection_id
       WHERE ms.platform = $1 AND ms.period = $2
         AND sc.status = 'active'
         AND ms.id NOT IN (${placeholders})
       GROUP BY ds.spend_date
       ORDER BY ds.spend_date`,
      [dbPlatform, period, ...topIds]
    )

    const otherSpendTotal = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(ms.actual_spend), 0)::text as total
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
       WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'
         AND ms.id NOT IN (${placeholders})`,
      [dbPlatform, period, ...topIds]
    )

    campaigns.push({
      campaignId: '__other__',
      campaignName: 'Other',
      campaignType: null,
      status: null,
      monthlySpend: parseFloat(otherSpendTotal?.total || '0'),
      monthlyBudget: 0,
      color: OTHER_COLOR,
      daily: otherDaily.map(r => ({
        date: r.spend_date,
        spend: parseFloat(r.total_spend),
        impressions: parseInt(r.total_impressions, 10),
        clicks: parseInt(r.total_clicks, 10),
      })),
    })
  }

  // 6. Aggregate totals — scoped to connection when provided
  const connFilter = connectionId ? ' AND ms.connection_id = $3' : ''
  const totalsParams = connectionId ? [dbPlatform, period, connectionId] : [dbPlatform, period]

  const dailyRows = await queryRows<{
    spend_date: string
    total_spend: string
    total_impressions: string
    total_clicks: string
    total_conversions: string
    total_revenue: string
  }>(
    `SELECT ds.spend_date::text as spend_date,
            SUM(ds.spend)::text as total_spend,
            SUM(ds.impressions)::text as total_impressions,
            SUM(ds.clicks)::text as total_clicks,
            SUM(ds.conversions)::text as total_conversions,
            SUM(ds.revenue)::text as total_revenue
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'${connFilter}
     GROUP BY ds.spend_date
     ORDER BY ds.spend_date`,
    totalsParams
  )

  const budgetRow = await queryOne<{ total_budget: string }>(
    `SELECT COALESCE(SUM(ms.budget_allocated), 0)::text as total_budget
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'${connFilter}`,
    totalsParams
  )

  const totalBudget = parseFloat(budgetRow?.total_budget || '0')
  const dailyBudget = totalBudget > 0 ? totalBudget / daysInMonth : 0

  let totals = dailyRows.map(row => ({
    date: row.spend_date,
    spend: parseFloat(row.total_spend),
    budget: Math.round(dailyBudget * 100) / 100,
    impressions: parseInt(row.total_impressions, 10),
    clicks: parseInt(row.total_clicks, 10),
    conversions: parseFloat(row.total_conversions) || 0,
    revenue: parseFloat(row.total_revenue) || 0,
  }))

  // Fallback totals: if no daily_spend rows but campaigns have spend, aggregate from campaign estimates
  if (totals.length === 0 && campaigns.some(c => c.daily.length > 0)) {
    const totalsByDate: Record<string, { spend: number; impressions: number; clicks: number }> = {}
    for (const camp of campaigns) {
      for (const d of camp.daily) {
        if (!totalsByDate[d.date]) totalsByDate[d.date] = { spend: 0, impressions: 0, clicks: 0 }
        const total = totalsByDate[d.date]
        if (!total) continue
        total.spend += d.spend
        total.impressions += d.impressions
        total.clicks += d.clicks
      }
    }
    totals = Object.entries(totalsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        spend: Math.round(v.spend * 100) / 100,
        budget: Math.round(dailyBudget * 100) / 100,
        impressions: v.impressions,
        clicks: v.clicks,
        // Campaign daily points carry no conversion/revenue, so the estimated
        // fallback leaves these at 0 (Performance tab shows "no conversion data").
        conversions: 0,
        revenue: 0,
      }))
  }

  return { campaigns, totals, estimated: usedEstimatedFallback }
  } // end fetcher

  if (cacheKey) {
    return cachedFetch(event, cacheKey, 300, fetcher)
  }
  return fetcher()
})
