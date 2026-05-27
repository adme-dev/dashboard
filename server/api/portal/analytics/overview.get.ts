/**
 * Portal Analytics Overview — client-scoped
 * GET /api/portal/analytics/overview
 *
 * Query params: startDate, endDate, platform? (comma-separated)
 * Strips commission/budget data (clients shouldn't see those).
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_LEAD_STATUS_SELECT,
  PORTAL_VISIBLE_LEADS_EXISTS,
  leadPlatformForSourceSql
} from '~~/server/utils/leads/portalAnalytics'

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

  // Build WHERE — match via direct client_id, social_connections.client_id, or ad_account_client_map
  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
  const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
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
    const prevConditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
    const prevParams: unknown[] = [prevStart.toISOString().slice(0, 7), prevEnd.toISOString().slice(0, 7), clientId]
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

    const leadConditions = [
      'l.client_id = $1',
      'l.deleted_at IS NULL',
      'l.submitted_at >= $2::date',
      `l.submitted_at < ($3::date + INTERVAL '1 day')`,
      PORTAL_VISIBLE_LEADS_EXISTS
    ]
    const leadParams: unknown[] = [clientId, startDate, endDate]
    if (platforms && platforms.length > 0) {
      leadConditions.push(`${leadPlatformForSourceSql('l')} = ANY($4)`)
      leadParams.push(platforms)
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
      'l.client_id = $1',
      'l.deleted_at IS NULL',
      'l.submitted_at >= $2::date',
      `l.submitted_at < ($3::date + INTERVAL '1 day')`,
      PORTAL_VISIBLE_LEADS_EXISTS
    ]
    const prevLeadParams: unknown[] = [
      clientId,
      prevStart.toISOString().slice(0, 10),
      prevEnd.toISOString().slice(0, 10)
    ]
    if (platforms && platforms.length > 0) {
      prevLeadConditions.push(`${leadPlatformForSourceSql('l')} = ANY($4)`)
      prevLeadParams.push(platforms)
    }

    const prevLeadRows = await queryRows(`
      SELECT ${PORTAL_LEAD_STATUS_SELECT}
      FROM leads l
      WHERE ${prevLeadConditions.join(' AND ')}
    `, prevLeadParams)

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

    const byPlatform = byPlatformRows.map((r) => {
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
        pctOfTotal: totalSpend > 0 ? Math.round((spend / totalSpend) * 10000) / 100 : 0
      }
    })

    const prev = prevRows[0] || {}
    const pSpend = toNum(prev.spend)
    const pImpressions = toNum(prev.impressions)
    const pClicks = toNum(prev.clicks)
    const pConversions = toNum(prev.conversions)
    const pRevenue = toNum(prev.revenue)
    const prevMetrics = computeMetrics(pSpend, pImpressions, pClicks, pConversions, pRevenue)
    const leadTotals = leadRows[0] || {}
    const previousLeadTotals = prevLeadRows[0] || {}

    // Note: no budget or commission fields exposed to clients
    return {
      totals: {
        spend: totalSpend,
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
      previousPeriod: {
        spend: pSpend,
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
    console.error('Portal analytics overview failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch analytics' })
  }
})
