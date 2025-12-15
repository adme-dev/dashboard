/**
 * Get Budget Health Dashboard
 * GET /api/agency/budget-alerts/health
 *
 * Returns overall budget health metrics and project-level status
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  try {
    // Get active projects with budget status
    const projects = await queryRows(`
      SELECT
        p.id,
        p.name as project_name,
        c.name as client_name,
        p.status as project_status,
        p.budget_amount,
        p.budget_type,
        p.start_date,
        p.end_date,
        COALESCE(labor.total_labor, 0) as labor_cost,
        COALESCE(exp.total_expenses, 0) as expense_cost,
        COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0) as total_spent,
        CASE
          WHEN p.budget_amount > 0
          THEN ROUND(((COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) / p.budget_amount * 100)::numeric, 1)
          ELSE 0
        END as percent_consumed,
        p.budget_amount - (COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) as remaining_budget,
        COALESCE(alerts.alert_count, 0) as active_alerts,
        alerts.max_severity
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN (
        SELECT project_id, SUM(hours * hourly_rate) as total_labor
        FROM time_entries
        GROUP BY project_id
      ) labor ON p.id = labor.project_id
      LEFT JOIN (
        SELECT project_id, SUM(total_amount) as total_expenses
        FROM expenses
        WHERE status = 'approved'
        GROUP BY project_id
      ) exp ON p.id = exp.project_id
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*) as alert_count,
          MAX(CASE severity
            WHEN 'danger' THEN 'danger'
            WHEN 'critical' THEN 'critical'
            WHEN 'warning' THEN 'warning'
            ELSE 'info'
          END) as max_severity
        FROM budget_alerts
        WHERE status = 'active'
        GROUP BY project_id
      ) alerts ON p.id = alerts.project_id
      WHERE p.status = 'active'
      ORDER BY percent_consumed DESC NULLS LAST
    `)

    // Calculate overall health metrics
    const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget_amount || 0), 0)
    const totalSpent = projects.reduce((sum, p) => sum + Number(p.total_spent || 0), 0)
    const overBudgetCount = projects.filter(p => Number(p.percent_consumed || 0) > 100).length
    const atRiskCount = projects.filter(p => {
      const pct = Number(p.percent_consumed || 0)
      return pct > 75 && pct <= 100
    }).length

    // Get recent alerts
    const recentAlerts = await queryRows(`
      SELECT
        ba.id,
        ba.alert_type,
        ba.severity,
        ba.title,
        ba.message,
        ba.percent_consumed,
        ba.created_at,
        p.name as project_name
      FROM budget_alerts ba
      LEFT JOIN projects p ON ba.project_id = p.id
      WHERE ba.status = 'active'
      ORDER BY
        CASE ba.severity
          WHEN 'danger' THEN 1
          WHEN 'critical' THEN 2
          WHEN 'warning' THEN 3
          ELSE 4
        END,
        ba.created_at DESC
      LIMIT 10
    `)

    // Get burn rate trends (last 4 weeks)
    const burnRateTrends = await queryRows(`
      SELECT
        DATE_TRUNC('week', te.date)::DATE as week_start,
        SUM(te.hours * te.hourly_rate) as labor_spend,
        COALESCE(exp.expense_spend, 0) as expense_spend,
        SUM(te.hours * te.hourly_rate) + COALESCE(exp.expense_spend, 0) as total_spend
      FROM time_entries te
      LEFT JOIN (
        SELECT
          DATE_TRUNC('week', expense_date)::DATE as week_start,
          SUM(total_amount) as expense_spend
        FROM expenses
        WHERE status = 'approved'
          AND expense_date >= CURRENT_DATE - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', expense_date)
      ) exp ON DATE_TRUNC('week', te.date)::DATE = exp.week_start
      WHERE te.date >= CURRENT_DATE - INTERVAL '4 weeks'
      GROUP BY DATE_TRUNC('week', te.date), exp.expense_spend
      ORDER BY week_start
    `)

    return {
      summary: {
        totalBudget,
        totalSpent,
        totalRemaining: totalBudget - totalSpent,
        overallUtilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
        projectCount: projects.length,
        overBudgetCount,
        atRiskCount,
        healthyCount: projects.length - overBudgetCount - atRiskCount
      },
      projects: projects.map(p => ({
        id: p.id,
        projectName: p.project_name,
        clientName: p.client_name,
        status: p.project_status,
        budgetAmount: Number(p.budget_amount || 0),
        budgetType: p.budget_type,
        laborCost: Number(p.labor_cost || 0),
        expenseCost: Number(p.expense_cost || 0),
        totalSpent: Number(p.total_spent || 0),
        percentConsumed: Number(p.percent_consumed || 0),
        remainingBudget: Number(p.remaining_budget || 0),
        activeAlerts: Number(p.active_alerts || 0),
        maxSeverity: p.max_severity,
        healthStatus: Number(p.percent_consumed || 0) > 100 ? 'over_budget'
          : Number(p.percent_consumed || 0) > 90 ? 'critical'
          : Number(p.percent_consumed || 0) > 75 ? 'at_risk'
          : 'healthy',
        startDate: p.start_date,
        endDate: p.end_date
      })),
      recentAlerts: recentAlerts.map(a => ({
        id: a.id,
        alertType: a.alert_type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        percentConsumed: Number(a.percent_consumed || 0),
        projectName: a.project_name,
        createdAt: a.created_at
      })),
      burnRateTrends: burnRateTrends.map(t => ({
        weekStart: t.week_start,
        laborSpend: Number(t.labor_spend || 0),
        expenseSpend: Number(t.expense_spend || 0),
        totalSpend: Number(t.total_spend || 0)
      }))
    }
  } catch (error) {
    console.error('Failed to fetch budget health:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch budget health'
    })
  }
})
