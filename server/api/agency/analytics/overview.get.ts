/**
 * Analytics Overview
 * GET /api/agency/analytics/overview
 *
 * Query params: startDate, endDate, clientId?, platform? (comma-separated)
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS } from '~~/server/utils/analyticsMetrics'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null

  // Build dynamic WHERE conditions
  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2']
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

  const where = conditions.join(' AND ')

  // Previous period: shift back by the date range duration
  const start = new Date(startDate)
  const end = new Date(endDate)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  const prevStartPeriod = prevStart.toISOString().slice(0, 7)
  const prevEndPeriod = prevEnd.toISOString().slice(0, 7)

  try {
    // By platform
    const byPlatformRows = await queryRows(`
      SELECT
        ms.platform,
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
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

    // By client
    const byClientRows = await queryRows(`
      SELECT
        ms.client_id,
        c.name as client_name,
        SUM(ms.actual_spend) as spend,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue,
        ARRAY_AGG(DISTINCT ms.platform) as platforms,
        COUNT(DISTINCT ms.campaign_id) as campaign_count
      FROM media_spend ms
      LEFT JOIN agency_clients c ON ms.client_id = c.id
      WHERE ${where}
      GROUP BY ms.client_id, c.name
      ORDER BY spend DESC
    `, params)

    // Previous period totals
    const prevConditions: string[] = [`ms.period >= $1`, `ms.period <= $2`]
    const prevParams: any[] = [prevStartPeriod, prevEndPeriod]
    let prevIdx = 3
    if (clientId) {
      prevConditions.push(`ms.client_id = $${prevIdx}`)
      prevParams.push(clientId)
      prevIdx++
    }
    if (platforms && platforms.length > 0) {
      prevConditions.push(`ms.platform = ANY($${prevIdx})`)
      prevParams.push(platforms)
      prevIdx++
    }
    const prevWhere = prevConditions.join(' AND ')

    const prevRows = await queryRows(`
      SELECT
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue
      FROM media_spend ms
      WHERE ${prevWhere}
    `, prevParams)

    // Compute totals
    let totalSpend = 0, totalBudget = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalRevenue = 0
    for (const r of byPlatformRows) {
      totalSpend += toNum(r.spend)
      totalBudget += toNum(r.budget)
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

    const byClient = byClientRows.map(r => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)
      return {
        clientId: r.client_id,
        clientName: r.client_name || 'Unknown',
        spend,
        platforms: r.platforms || [],
        campaignCount: Number(r.campaign_count || 0),
        cpc: metrics.cpc,
        ctr: metrics.ctr,
      }
    })

    const prev = prevRows[0] || {}
    const pSpend = toNum(prev.spend)
    const pBudget = toNum(prev.budget)
    const pImpressions = toNum(prev.impressions)
    const pClicks = toNum(prev.clicks)
    const pConversions = toNum(prev.conversions)
    const pRevenue = toNum(prev.revenue)
    const prevMetrics = computeMetrics(pSpend, pImpressions, pClicks, pConversions, pRevenue)

    return {
      totals: {
        spend: totalSpend,
        budget: totalBudget,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        ...totalsMetrics,
      },
      byPlatform,
      byClient,
      previousPeriod: {
        spend: pSpend,
        budget: pBudget,
        impressions: pImpressions,
        clicks: pClicks,
        conversions: pConversions,
        revenue: pRevenue,
        ...prevMetrics,
      },
    }
  } catch (error) {
    console.error('Analytics overview failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics overview' })
  }
})
