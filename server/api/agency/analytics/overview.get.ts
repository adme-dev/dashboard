/**
 * Analytics Overview
 * GET /api/agency/analytics/overview
 *
 * Query params: startDate, endDate, clientId?, platform? (comma-separated)
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_LEAD_STATUS_SELECT,
  leadPlatformForSourceSql
} from '~~/server/utils/leads/portalAnalytics'

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
        COUNT(DISTINCT ms.campaign_id) as campaign_count,
        COUNT(DISTINCT CASE WHEN ms.budget_rolling THEN ms.campaign_id END) as rolling_count
      FROM media_spend ms
      WHERE ${where}
      GROUP BY ms.platform
      ORDER BY spend DESC
    `, params)

    // By client (group unlinked campaigns under "Unassigned")
    const byClientRows = await queryRows(`
      SELECT
        ms.client_id,
        COALESCE(c.name, 'Unassigned') as client_name,
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue,
        ARRAY_AGG(DISTINCT ms.platform) as platforms,
        COUNT(DISTINCT ms.campaign_id) as campaign_count,
        COUNT(DISTINCT CASE WHEN ms.budget_rolling THEN ms.campaign_id END) as rolling_count
      FROM media_spend ms
      LEFT JOIN agency_clients c ON ms.client_id = c.id
      WHERE ${where}
      GROUP BY ms.client_id, c.name
      ORDER BY spend DESC
    `, params)

    // Previous period totals
    const prevConditions: string[] = [`ms.period >= $1`, `ms.period <= $2`]
    const prevParams: unknown[] = [prevStartPeriod, prevEndPeriod]
    let prevIdx = 3
    if (clientId) {
      prevConditions.push(buildClientCondition(prevIdx))
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

    const leadRows = await queryRows(`
      SELECT
        ${PORTAL_LEAD_STATUS_SELECT},
        AVG(EXTRACT(EPOCH FROM (l.contacted_at - l.submitted_at)) / 60)
          FILTER (WHERE l.contacted_at IS NOT NULL) AS avg_response_minutes
      FROM leads l
      WHERE ${leadConditions.join(' AND ')}
    `, leadParams)

    const prevLeadConditions = [
      'l.deleted_at IS NULL',
      'l.submitted_at >= $1::date',
      `l.submitted_at < ($2::date + INTERVAL '1 day')`
    ]
    const prevLeadParams: unknown[] = [
      prevStart.toISOString().slice(0, 10),
      prevEnd.toISOString().slice(0, 10)
    ]
    let prevLeadIdx = 3
    if (clientId) {
      prevLeadConditions.push(`l.client_id = $${prevLeadIdx}`)
      prevLeadParams.push(clientId)
      prevLeadIdx++
    }
    if (platforms && platforms.length > 0) {
      prevLeadConditions.push(`${leadPlatformForSourceSql('l')} = ANY($${prevLeadIdx})`)
      prevLeadParams.push(platforms)
      prevLeadIdx++
    }

    const prevLeadRows = await queryRows(`
      SELECT ${PORTAL_LEAD_STATUS_SELECT}
      FROM leads l
      WHERE ${prevLeadConditions.join(' AND ')}
    `, prevLeadParams)

    // Compute totals
    let totalSpend = 0, totalBudget = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalRevenue = 0, totalRollingCount = 0
    for (const r of byPlatformRows) {
      totalSpend += toNum(r.spend)
      totalBudget += toNum(r.budget)
      totalImpressions += toNum(r.impressions)
      totalClicks += toNum(r.clicks)
      totalConversions += toNum(r.conversions)
      totalRevenue += toNum(r.revenue)
      totalRollingCount += Number(r.rolling_count || 0)
    }

    const totalsMetrics = computeMetrics(totalSpend, totalImpressions, totalClicks, totalConversions, totalRevenue)

    const byPlatform = byPlatformRows.map((r) => {
      const spend = toNum(r.spend)
      const budget = toNum(r.budget)
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
        budget,
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
        campaignCount: Number(r.campaign_count || 0),
        rollingCount: Number(r.rolling_count || 0),
        pctOfTotal: totalSpend > 0 ? Math.round((spend / totalSpend) * 10000) / 100 : 0
      }
    })

    const byClient = byClientRows.map((r) => {
      const spend = toNum(r.spend)
      const budget = toNum(r.budget)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)
      return {
        clientId: r.client_id,
        clientName: r.client_name || 'Unknown',
        spend,
        budget,
        platforms: r.platforms || [],
        campaignCount: Number(r.campaign_count || 0),
        rollingCount: Number(r.rolling_count || 0),
        cpc: metrics.cpc,
        ctr: metrics.ctr
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
    const leadTotals = leadRows[0] || {}
    const previousLeadTotals = prevLeadRows[0] || {}

    return {
      totals: {
        spend: totalSpend,
        budget: totalBudget,
        rollingCount: totalRollingCount,
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        leads: Number(leadTotals.lead_count || 0),
        leadNew: Number(leadTotals.lead_new_count || 0),
        leadContacted: Number(leadTotals.lead_contacted_count || 0),
        leadQualified: Number(leadTotals.lead_qualified_count || 0),
        leadWon: Number(leadTotals.lead_won_count || 0),
        leadLost: Number(leadTotals.lead_lost_count || 0),
        costPerLead: Number(leadTotals.lead_count || 0) > 0
          ? totalSpend / Number(leadTotals.lead_count || 0)
          : null,
        avgResponseMinutes: leadTotals.avg_response_minutes == null
          ? null
          : toNum(leadTotals.avg_response_minutes),
        ...totalsMetrics
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
        leads: Number(previousLeadTotals.lead_count || 0),
        leadNew: Number(previousLeadTotals.lead_new_count || 0),
        leadContacted: Number(previousLeadTotals.lead_contacted_count || 0),
        leadQualified: Number(previousLeadTotals.lead_qualified_count || 0),
        leadWon: Number(previousLeadTotals.lead_won_count || 0),
        leadLost: Number(previousLeadTotals.lead_lost_count || 0),
        costPerLead: Number(previousLeadTotals.lead_count || 0) > 0
          ? pSpend / Number(previousLeadTotals.lead_count || 0)
          : null,
        ...prevMetrics
      }
    }
  } catch (error) {
    console.error('Analytics overview failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics overview' })
  }
})
