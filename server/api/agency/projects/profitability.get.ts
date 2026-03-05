/**
 * Client Media Profitability Report
 * GET /api/agency/projects/profitability
 *
 * Shows commission-based profitability from media spend data, grouped by client.
 * Query params: month, year, clientId
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { cachedFetch } from '~~/server/utils/kv'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const clientId = query.clientId ? String(query.clientId) : null

  const emptyResult = {
    period, month, year,
    summary: { clientCount: 0, totalBudget: 0, totalSpend: 0, totalCommission: 0, avgCommissionRate: 0, campaignCount: 0, avgMargin: 0 },
    clients: [],
    commissionDistribution: []
  }

  return cachedFetch(event, `agency:profitability:${period}:${clientId || 'all'}`, 120, async () => {
  try {
    // Build filters
    const conditions = ['ms.period = $1']
    const params: any[] = [period]

    if (clientId) {
      conditions.push(`ms.client_id = $${params.length + 1}`)
      params.push(clientId)
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Per-client profitability
    const rows = await queryRows<any>(`
      SELECT
        COALESCE(ac.id::text, 'unmapped') as client_id,
        COALESCE(ac.name, 'Unmapped') as client_name,
        SUM(ms.budget_allocated) as total_budget,
        SUM(ms.actual_spend) as total_spend,
        SUM(ms.commission_amount) as total_commission,
        AVG(ms.commission_rate) as avg_commission_rate,
        COUNT(*)::int as campaign_count,
        array_agg(DISTINCT ms.platform) as platforms,
        SUM(COALESCE(ms.impressions, 0)) as total_impressions,
        SUM(COALESCE(ms.clicks, 0)) as total_clicks,
        SUM(COALESCE(ms.conversions, 0)) as total_conversions
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      ${whereClause}
      GROUP BY ac.id, ac.name
      ORDER BY total_commission DESC
    `, params)

    // Overall summary
    const summaryRow = await queryOne<any>(`
      SELECT
        COUNT(DISTINCT ms.client_id) as client_count,
        SUM(ms.budget_allocated) as total_budget,
        SUM(ms.actual_spend) as total_spend,
        SUM(ms.commission_amount) as total_commission,
        AVG(ms.commission_rate) as avg_commission_rate,
        COUNT(*)::int as campaign_count
      FROM media_spend ms
      ${whereClause}
    `, params)

    // Commission rate distribution (grouped by client)
    const commissionDistribution = await queryRows<any>(`
      SELECT
        CASE
          WHEN avg_rate = 0 THEN 'none'
          WHEN avg_rate > 0 AND avg_rate <= 5 THEN 'low'
          WHEN avg_rate > 5 AND avg_rate <= 10 THEN 'standard'
          WHEN avg_rate > 10 AND avg_rate <= 15 THEN 'premium'
          ELSE 'high'
        END as rate_band,
        COUNT(*)::int as band_count,
        CASE
          WHEN avg_rate = 0 THEN 1
          WHEN avg_rate > 0 AND avg_rate <= 5 THEN 2
          WHEN avg_rate > 5 AND avg_rate <= 10 THEN 3
          WHEN avg_rate > 10 AND avg_rate <= 15 THEN 4
          ELSE 5
        END as sort_order
      FROM (
        SELECT
          COALESCE(ms.client_id::text, 'unmapped') as cid,
          AVG(ms.commission_rate) as avg_rate
        FROM media_spend ms
        ${whereClause}
        GROUP BY ms.client_id
      ) sub
      GROUP BY rate_band, sort_order
      ORDER BY sort_order
    `, params)

    const clients = rows.map((c: any) => {
      const budget = parseFloat(c.total_budget) || 0
      const spend = parseFloat(c.total_spend) || 0
      const commission = parseFloat(c.total_commission) || 0
      const variance = budget > 0 ? spend - budget : 0
      const variancePct = budget > 0 ? ((spend - budget) / budget) * 100 : 0

      return {
        id: c.client_id,
        name: c.client_name,
        budget,
        spend,
        commission,
        commissionRate: Math.round((parseFloat(c.avg_commission_rate) || 0) * 10) / 10,
        variance,
        variancePercent: Math.round(variancePct * 10) / 10,
        campaignCount: c.campaign_count,
        platforms: (c.platforms || []).filter(Boolean),
        impressions: parseInt(c.total_impressions) || 0,
        clicks: parseInt(c.total_clicks) || 0,
        conversions: parseInt(c.total_conversions) || 0,
        // Margin = commission as % of spend managed
        margin: spend > 0 ? Math.round((commission / spend) * 1000) / 10 : 0
      }
    })

    const totalBudget = parseFloat(summaryRow?.total_budget) || 0
    const totalSpend = parseFloat(summaryRow?.total_spend) || 0
    const totalCommission = parseFloat(summaryRow?.total_commission) || 0

    return {
      period,
      month,
      year,
      summary: {
        clientCount: parseInt(summaryRow?.client_count) || 0,
        totalBudget,
        totalSpend,
        totalCommission,
        avgCommissionRate: Math.round((parseFloat(summaryRow?.avg_commission_rate) || 0) * 10) / 10,
        campaignCount: parseInt(summaryRow?.campaign_count) || 0,
        avgMargin: totalSpend > 0 ? Math.round((totalCommission / totalSpend) * 1000) / 10 : 0
      },
      clients,
      commissionDistribution: commissionDistribution.map((m: any) => ({
        range: m.rate_band,
        count: m.band_count
      }))
    }
  } catch (error: any) {
    // Only swallow table-not-found (42P01), not column errors (42703)
    if (error.code === '42P01') {
      return emptyResult
    }
    console.error('Failed to fetch profitability report:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch profitability report' })
  }
  })
})
