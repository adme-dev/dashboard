/**
 * Portal Analytics Overview — client-scoped
 * GET /api/portal/analytics/overview
 *
 * Query params: startDate, endDate, platform? (comma-separated)
 * Strips commission/budget data (clients shouldn't see those).
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS } from '~~/server/utils/analyticsMetrics'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled for your account' })
  }

  const clientId = clientUser.clientId
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null

  // Build WHERE
  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', 'ms.client_id = $3']
  const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
  let idx = 4

  if (platforms && platforms.length > 0) {
    conditions.push(`ms.platform = ANY($${idx})`)
    params.push(platforms)
    idx++
  }

  const where = conditions.join(' AND ')

  // Previous period
  const start = new Date(startDate)
  const end = new Date(endDate)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)

  try {
    // By platform
    const byPlatformRows = await queryRows(`
      SELECT
        ms.platform,
        SUM(ms.actual_spend) as spend,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue,
        COUNT(DISTINCT ms.campaign_id) as campaign_count
      FROM media_spend ms
      WHERE ${where}
      GROUP BY ms.platform
      ORDER BY spend DESC
    `, params)

    // Previous period
    const prevConditions: string[] = ['ms.period >= $1', 'ms.period <= $2', 'ms.client_id = $3']
    const prevParams: any[] = [prevStart.toISOString().slice(0, 7), prevEnd.toISOString().slice(0, 7), clientId]
    let prevIdx = 4
    if (platforms && platforms.length > 0) {
      prevConditions.push(`ms.platform = ANY($${prevIdx})`)
      prevParams.push(platforms)
      prevIdx++
    }

    const prevRows = await queryRows(`
      SELECT
        SUM(ms.actual_spend) as spend,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue
      FROM media_spend ms
      WHERE ${prevConditions.join(' AND ')}
    `, prevParams)

    // Compute totals
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalRevenue = 0
    for (const r of byPlatformRows) {
      totalSpend += toNum(r.spend)
      totalImpressions += toNum(r.impressions)
      totalClicks += toNum(r.clicks)
      totalConversions += toNum(r.conversions)
      totalRevenue += toNum(r.revenue)
    }

    const totalsMetrics = computeMetrics(totalSpend, totalImpressions, totalClicks, totalConversions, totalRevenue)

    const byPlatform = byPlatformRows.map(r => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)
      return {
        platform: r.platform,
        displayName: PLATFORM_LABELS[r.platform] || r.platform,
        color: PLATFORM_COLORS[r.platform] || '#888888',
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
        campaignCount: Number(r.campaign_count || 0),
        pctOfTotal: totalSpend > 0 ? Math.round((spend / totalSpend) * 10000) / 100 : 0,
      }
    })

    const prev = prevRows[0] || {}
    const pSpend = toNum(prev.spend)
    const pImpressions = toNum(prev.impressions)
    const pClicks = toNum(prev.clicks)
    const pConversions = toNum(prev.conversions)
    const pRevenue = toNum(prev.revenue)
    const prevMetrics = computeMetrics(pSpend, pImpressions, pClicks, pConversions, pRevenue)

    // Note: no budget or commission fields exposed to clients
    return {
      totals: {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        ...totalsMetrics,
      },
      byPlatform,
      previousPeriod: {
        spend: pSpend,
        impressions: pImpressions,
        clicks: pClicks,
        conversions: pConversions,
        revenue: pRevenue,
        ...prevMetrics,
      },
    }
  } catch (error) {
    console.error('Portal analytics overview failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics' })
  }
})
