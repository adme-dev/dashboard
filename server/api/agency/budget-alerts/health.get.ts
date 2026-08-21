/**
 * Budget Health Dashboard
 * GET /api/agency/budget-alerts/health
 *
 * Shows media spend budget health per client/platform with pacing and burn rate.
 * Query params: month, year
 */

import { queryRows } from '~~/server/utils/db'
import { STALENESS_THRESHOLD_HOURS } from '~~/server/utils/ai/tools/responseContract'
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
    summary: { totalBudget: 0, totalSpent: 0, budgetedSpend: 0, trackedSpend: 0, totalRemaining: 0, overallUtilization: 0, clientCount: 0, partialBudgetCoverageCount: 0, overBudgetCount: 0, atRiskCount: 0, underspendCount: 0, healthyCount: 0, noBudgetCount: 0 },
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
        SUM(COALESCE(ms.budget_allocated, 0)) as total_budget,
        SUM(COALESCE(ms.actual_spend, 0)) as total_spend,
        SUM(COALESCE(ms.commission_amount, 0)) as total_commission,
        COUNT(*)::int as campaign_count,
        COUNT(*) FILTER (WHERE COALESCE(ms.budget_allocated, 0) > 0)::int as budgeted_campaign_count,
        MAX(ms.synced_at)::text as last_synced_at,
        MIN(ms.synced_at)::text as oldest_synced_at,
        MAX(COALESCE(coverage.spend_as_of, ms.synced_at::date))::text as spend_as_of,
        COUNT(*) FILTER (WHERE ms.synced_at IS NULL OR ms.synced_at < NOW() - MAKE_INTERVAL(hours => $2))::int as stale_row_count,
        bool_or(COALESCE(ms.budget_rolling, false)) as is_rolling
      FROM media_spend ms
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      LEFT JOIN LATERAL (
        SELECT MAX(ds.spend_date) AS spend_as_of
        FROM daily_spend ds
        WHERE ds.media_spend_id = ms.id
      ) coverage ON TRUE
      WHERE ms.period = $1
      GROUP BY ac.id, ac.name, ms.platform
      ORDER BY total_spend DESC
    `, [period, STALENESS_THRESHOLD_HOURS])

    // Calculate month progress for pacing
    const daysInMonth = new Date(year, month, 0).getDate()
    const clients = rows.map((r: any) => {
      const budget = parseFloat(r.total_budget) || 0
      const spend = parseFloat(r.total_spend) || 0
      const remaining = budget - spend
      const percentConsumed = budget > 0 ? (spend / budget) * 100 : 0
      const pacing = computeCampaignBudgetPacing({
        monthlyBudget: budget,
        mtdSpend: spend,
        period,
        now,
        spendAsOf: r.spend_as_of,
      })
      const pacingRatio = pacing.pacingRatio
      const campaignCount = Number(r.campaign_count) || 0
      const budgetedCampaignCount = Number(r.budgeted_campaign_count) || 0
      const hasPartialBudgetCoverage = budget > 0 && budgetedCampaignCount < campaignCount

      let healthStatus: string
      if (budget === 0) healthStatus = 'no_budget'
      else if (hasPartialBudgetCoverage) healthStatus = 'partial_budget_coverage'
      else if (percentConsumed > 100) healthStatus = 'over_budget'
      else if (pacingRatio > 1.15) healthStatus = 'critical'
      else if (pacingRatio > 1.05) healthStatus = 'at_risk'
      else if (pacingRatio < 0.8 && pacing.elapsedDays > 7) healthStatus = 'underspend'
      else healthStatus = 'healthy'

      return {
        clientId: r.client_id,
        clientName: r.client_name,
        platform: r.platform,
        budget,
        spend,
        commission: parseFloat(r.total_commission) || 0,
        remaining,
        percentConsumed: hasPartialBudgetCoverage ? null : Math.round(percentConsumed * 10) / 10,
        pacingRatio: hasPartialBudgetCoverage ? null : Math.round(pacingRatio * 100) / 100,
        campaignCount,
        budgetedCampaignCount,
        budgetCoverageComplete: !hasPartialBudgetCoverage,
        lastSyncedAt: r.last_synced_at,
        oldestSyncedAt: r.oldest_synced_at,
        staleRowCount: Number(r.stale_row_count) || 0,
        spendAsOf: pacing.spendAsOf,
        rolling: r.is_rolling || false,
        healthStatus
      }
    })

    // Portfolio rollups use the oldest contributing coverage date. Individual client rows retain
    // their own spendAsOf, so no pacing numerator is ever presented against request-time progress.
    const portfolioSpendAsOf = clients
      .map(client => client.spendAsOf)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null
    const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month
    const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < (now.getMonth() + 1))
    const portfolioElapsedDay = isCurrentMonth && portfolioSpendAsOf?.startsWith(period)
      ? Number(portfolioSpendAsOf.slice(8, 10))
      : isPastMonth ? daysInMonth : 0
    const monthProgress = daysInMonth > 0 ? (portfolioElapsedDay / daysInMonth) * 100 : 0

    // Summary calculations
    const withBudget = clients.filter(c => c.budget > 0)
    const roundCurrency = (value: number) => Math.round(value * 100) / 100
    const totalBudget = roundCurrency(withBudget.reduce((s, c) => s + c.budget, 0))
    const budgetedSpend = roundCurrency(withBudget.reduce((s, c) => s + c.spend, 0))
    const trackedSpend = roundCurrency(clients.reduce((s, c) => s + c.spend, 0))
    const partialBudgetCoverageCount = withBudget.filter(c => c.healthStatus === 'partial_budget_coverage').length

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
        MAX(ds.spend_date)::text as spend_as_of,
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
        spendAsOf: r.spend_as_of ?? r.last_synced_at,
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
      spendAsOf: portfolioSpendAsOf,
      summary: {
        totalBudget,
        totalSpent: budgetedSpend,
        budgetedSpend,
        trackedSpend,
        totalRemaining: roundCurrency(totalBudget - budgetedSpend),
        overallUtilization: partialBudgetCoverageCount > 0
          ? null
          : totalBudget > 0 ? Math.round((budgetedSpend / totalBudget) * 100) : 0,
        clientCount: withBudget.length,
        partialBudgetCoverageCount,
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
