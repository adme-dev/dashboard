/**
 * Agency KPIs Endpoint
 * Returns key performance indicators calculated from Postgres
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'

export default defineEventHandler(async (event) => {
  const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM

  return cachedFetch(event, `agency:kpis:${currentPeriod}`, 60, async () => {
  try {
    // Get financial summary
    const financials = await queryOne(`
      SELECT
        COALESCE(SUM(p.budget_amount), 0) as total_revenue,
        COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0) as total_cost,
        COALESCE(SUM(p.budget_amount), 0) - (COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0)) as gross_profit,
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
        COUNT(DISTINCT c.id) as active_clients
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id AND c.is_active = true
      LEFT JOIN (
        SELECT project_id, SUM(hours * hourly_rate) as labor_cost
        FROM time_entries
        GROUP BY project_id
      ) t ON p.id = t.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        GROUP BY project_id
      ) e ON p.id = e.project_id
      WHERE p.status IN ('active', 'completed')
    `)

    // Get MRR from retainers
    const mrrResult = await queryOne(`
      SELECT COALESCE(SUM(retainer_amount), 0) as mrr
      FROM agency_clients
      WHERE is_active = true AND retainer_amount IS NOT NULL
    `)

    // Get utilization metrics
    const utilization = await queryRows(`
      SELECT
        tm.name,
        COALESCE(SUM(te.hours), 0) as total_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) as billable_hours,
        tm.target_utilization as target,
        CASE
          WHEN COALESCE(SUM(te.hours), 0) > 0
          THEN (COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) / SUM(te.hours) * 100)
          ELSE 0
        END as rate
      FROM team_members tm
      LEFT JOIN time_entries te ON tm.id = te.user_id AND te.date >= date_trunc('month', CURRENT_DATE)
      WHERE tm.is_active = true
      GROUP BY tm.id, tm.name, tm.target_utilization
      ORDER BY rate DESC
    `)

    // Get budget alerts (projects over 80% budget used)
    const budgetAlerts = await queryRows(`
      SELECT
        p.name as project,
        p.budget_amount as budget,
        COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) as spent,
        CASE
          WHEN p.budget_amount > 0
          THEN ((COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0)) / p.budget_amount * 100)
          ELSE 0
        END as percent_used,
        p.end_date
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(hours * hourly_rate) as labor_cost
        FROM time_entries
        GROUP BY project_id
      ) t ON p.id = t.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        GROUP BY project_id
      ) e ON p.id = e.project_id
      WHERE p.status = 'active'
      AND p.budget_amount > 0
      AND ((COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0)) / p.budget_amount * 100) >= 80
      ORDER BY percent_used DESC
      LIMIT 5
    `)

    // Calculate derived metrics
    const totalRevenue = Number(financials?.total_revenue) || 0
    const totalCost = Number(financials?.total_cost) || 0
    const grossProfit = Number(financials?.gross_profit) || 0
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const mrr = Number(mrrResult?.mrr) || 0

    // Average utilization
    const avgUtilization = utilization.length > 0
      ? utilization.reduce((sum, u) => sum + Number(u.rate), 0) / utilization.length
      : 0

    return {
      period: currentPeriod,

      // Financial KPIs
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin,
      netProfit: grossProfit * 0.7, // Simplified: assume 30% overhead
      netMargin: grossMargin * 0.7,
      mrr,

      // Operational KPIs
      avgUtilizationRate: avgUtilization,
      avgBillableRate: 165, // Would calculate from actual data
      writeOffAmount: 0,
      writeOffRate: 0,

      // Client KPIs
      activeClients: Number(financials?.active_clients) || 0,
      activeProjects: Number(financials?.active_projects) || 0,
      avgProjectValue: Number(financials?.active_projects) > 0
        ? totalRevenue / Number(financials?.active_projects)
        : 0,
      clientChurnRate: 0,

      // Benchmarks
      billingsPerFTE: utilization.length > 0 ? totalRevenue / utilization.length : 0,
      revenuePerEmployee: utilization.length > 0 ? totalRevenue / utilization.length : 0,

      // Change indicators (would calculate from historical data)
      revenueChange: 0,
      marginChange: 0,
      utilizationChange: 0,
      mrrChange: 0,

      // Outstanding AR (placeholder - would come from Xero integration)
      outstandingAR: 0,

      // Team utilization
      teamUtilization: utilization.map(u => ({
        name: u.name,
        rate: Number(u.rate),
        target: Number(u.target)
      })),

      // Budget alerts
      budgetAlerts: budgetAlerts.map(a => ({
        project: a.project,
        severity: Number(a.percent_used) >= 95 ? 'critical' as const : 'warning' as const,
        percentUsed: Math.round(Number(a.percent_used)),
        message: Number(a.percent_used) >= 95
          ? `Only ${100 - Math.round(Number(a.percent_used))}% budget remaining`
          : `${Math.round(Number(a.percent_used))}% of budget used`
      }))
    }
  } catch (error) {
    console.error('Failed to fetch KPIs:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch KPIs'
    })
  }
  })
})
