/**
 * Budget Health Dashboard
 * GET /api/agency/budget-alerts/health
 *
 * Shows media spend budget health per client/platform with pacing and burn rate.
 * Query params: month, year
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeCampaignBudgetPacing, statusSeverityRank } from '~~/server/utils/budgetPacing'
import { getSelectedTenant } from '~~/server/utils/session'
import { buildCampaignBudgetIdentity } from '~~/server/utils/campaignBudgetIdentity'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  const query = getQuery(event)

  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`

  const emptyResult = {
    period, month, year, monthProgress: 0,
    summary: { totalBudget: 0, totalSpent: 0, totalRemaining: 0, overallUtilization: 0, clientCount: 0, overBudgetCount: 0, atRiskCount: 0, underspendCount: 0, healthyCount: 0, noBudgetCount: 0 },
    clients: [],
    burnRateTrends: [],
    campaigns: []
  }

  try {
    // Per-client/platform budget health
    const rows = await queryRows<any>(`
      SELECT
        COALESCE(ac.id::text, 'unmapped') as client_id,
        COALESCE(ac.name, 'Unmapped') as client_name,
        ms.platform,
        SUM(ms.budget_allocated) as total_budget,
        SUM(ms.actual_spend) as total_spend,
        SUM(ms.commission_amount) as total_commission,
        COUNT(*)::int as campaign_count,
        bool_or(COALESCE(ms.budget_rolling, false)) as is_rolling
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      WHERE ms.period = $1
      GROUP BY ac.id, ac.name, ms.platform
      ORDER BY total_spend DESC
    `, [period])

    // Calculate month progress for pacing
    const daysInMonth = new Date(year, month, 0).getDate()
    const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month
    const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < (now.getMonth() + 1))
    const currentDay = isCurrentMonth ? now.getDate() : isPastMonth ? daysInMonth : 0
    const monthProgress = daysInMonth > 0 ? (currentDay / daysInMonth) * 100 : 0

    const clients = rows.map((r: any) => {
      const budget = parseFloat(r.total_budget) || 0
      const spend = parseFloat(r.total_spend) || 0
      const remaining = budget - spend
      const percentConsumed = budget > 0 ? (spend / budget) * 100 : 0
      const pacingRatio = monthProgress > 0 && budget > 0 ? (percentConsumed / monthProgress) : 0

      let healthStatus: string
      if (budget === 0) healthStatus = 'no_budget'
      else if (percentConsumed > 100) healthStatus = 'over_budget'
      else if (pacingRatio > 1.15) healthStatus = 'critical'
      else if (pacingRatio > 1.05) healthStatus = 'at_risk'
      else if (pacingRatio < 0.8 && currentDay > 7) healthStatus = 'underspend'
      else healthStatus = 'healthy'

      return {
        clientId: r.client_id,
        clientName: r.client_name,
        platform: r.platform,
        budget,
        spend,
        commission: parseFloat(r.total_commission) || 0,
        remaining,
        percentConsumed: Math.round(percentConsumed * 10) / 10,
        pacingRatio: Math.round(pacingRatio * 100) / 100,
        campaignCount: r.campaign_count,
        rolling: r.is_rolling || false,
        healthStatus
      }
    })

    // Summary calculations
    const withBudget = clients.filter(c => c.budget > 0)
    const totalBudget = clients.reduce((s, c) => s + c.budget, 0)
    const totalSpent = clients.reduce((s, c) => s + c.spend, 0)

    // Weekly burn rate from daily_spend
    const dailyTrends = await queryRows<any>(`
      SELECT
        DATE_TRUNC('week', ds.spend_date)::DATE as week_start,
        SUM(ds.spend) as total_spend,
        SUM(COALESCE(ds.impressions, 0)) as total_impressions,
        SUM(COALESCE(ds.clicks, 0)) as total_clicks,
        COUNT(DISTINCT ds.media_spend_id)::int as campaign_count
      FROM daily_spend ds
      JOIN media_spend ms ON ds.media_spend_id = ms.id
      WHERE ms.period = $1
      GROUP BY DATE_TRUNC('week', ds.spend_date)
      ORDER BY week_start
    `, [period])

    const campaignRows = await queryRows<any>(`
      SELECT
        ms.id::text as media_spend_id,
        ms.campaign_id,
        COALESCE(ms.campaign_name, 'Unnamed campaign') as campaign_name,
        ms.connection_id::text as connection_id,
        sc.account_id as budget_account_id,
        COALESCE(ac.id::text, 'unmapped') as client_id,
        COALESCE(ac.name, 'Unmapped') as client_name,
        ms.platform,
        ms.campaign_status,
        ms.end_date::text as end_date,
        COALESCE(ms.budget_rolling, false) as budget_rolling,
        COALESCE(ms.budget_allocated, 0) as monthly_budget,
        COALESCE(ms.actual_spend, 0) as mtd_spend,
        COALESCE(SUM(ds.impressions), 0) as impressions,
        COALESCE(SUM(ds.clicks), 0) as clicks,
        COALESCE(SUM(ds.conversions), 0) as conversions,
        MAX(ms.synced_at)::text as last_synced_at
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      LEFT JOIN daily_spend ds ON ds.media_spend_id = ms.id
      WHERE ms.period = $1
      GROUP BY ms.id, ac.id, ac.name, sc.account_id
    `, [period])

    const campaigns = campaignRows.map((r: any) => {
      const monthlyBudget = parseFloat(r.monthly_budget) || 0
      const mtdSpend = parseFloat(r.mtd_spend) || 0
      const pacing = computeCampaignBudgetPacing({
        monthlyBudget,
        mtdSpend,
        period,
        now,
        campaignStatus: r.campaign_status,
        endDate: r.end_date
      })
      const budgetIdentity = buildCampaignBudgetIdentity({
        tenantId,
        clientId: r.client_id === 'unmapped' ? null : r.client_id,
        platform: r.platform,
        accountId: r.budget_account_id,
        connectionId: r.connection_id,
        campaignExternalId: r.campaign_id,
        campaignName: r.campaign_name,
        mediaSpendId: r.media_spend_id,
        period
      })

      return {
        mediaSpendId: r.media_spend_id,
        budgetKey: budgetIdentity.key,
        budgetActionable: budgetIdentity.actionable,
        budgetIdentityIssues: budgetIdentity.issues,
        budgetPeriod: budgetIdentity.period,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        clientId: r.client_id,
        clientName: r.client_name,
        platform: r.platform,
        campaignStatus: r.campaign_status,
        endDate: r.end_date,
        budgetRolling: r.budget_rolling === true,
        impressions: parseInt(r.impressions) || 0,
        clicks: parseInt(r.clicks) || 0,
        conversions: parseInt(r.conversions) || 0,
        lastSyncedAt: r.last_synced_at,
        ...pacing
      }
    }).sort((a: any, b: any) => {
      const severity = statusSeverityRank(a.pacingStatus) - statusSeverityRank(b.pacingStatus)
      if (severity !== 0) return severity
      return b.mtdSpend - a.mtdSpend
    })

    return {
      period,
      month,
      year,
      monthProgress: Math.round(monthProgress),
      summary: {
        totalBudget,
        totalSpent,
        totalRemaining: totalBudget - totalSpent,
        overallUtilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
        clientCount: withBudget.length,
        overBudgetCount: withBudget.filter(c => c.healthStatus === 'over_budget').length,
        atRiskCount: withBudget.filter(c => c.healthStatus === 'at_risk' || c.healthStatus === 'critical').length,
        underspendCount: withBudget.filter(c => c.healthStatus === 'underspend').length,
        healthyCount: withBudget.filter(c => c.healthStatus === 'healthy').length,
        noBudgetCount: clients.filter(c => c.budget === 0).length
      },
      clients,
      burnRateTrends: dailyTrends.map((t: any) => ({
        weekStart: t.week_start,
        totalSpend: parseFloat(t.total_spend) || 0,
        impressions: parseInt(t.total_impressions) || 0,
        clicks: parseInt(t.total_clicks) || 0,
        campaignCount: t.campaign_count
      })),
      campaigns
    }
  } catch (error: any) {
    // Only swallow table-not-found (42P01), not column errors
    if (error.code === '42P01') {
      return emptyResult
    }
    console.error('Failed to fetch budget health:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch budget health' })
  }
})
