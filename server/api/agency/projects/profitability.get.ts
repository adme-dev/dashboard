/**
 * Project Profitability Report
 * GET /api/agency/projects/profitability
 *
 * Provides detailed profitability analysis for projects
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const {
    startDate,
    endDate,
    clientId,
    status = 'all'
  } = query

  try {
    // Build filters
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (startDate) {
      conditions.push(`p.start_date >= $${idx}`)
      params.push(startDate)
      idx++
    }

    if (endDate) {
      conditions.push(`p.end_date <= $${idx}`)
      params.push(endDate)
      idx++
    }

    if (clientId) {
      conditions.push(`p.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`p.status = $${idx}`)
      params.push(status)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get detailed project profitability
    const projects = await queryRows(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.budget_amount,
        p.budget_type,
        p.start_date,
        p.end_date,
        p.status,
        c.id as client_id,
        c.name as client_name,
        COALESCE(te.hours_worked, 0) as hours_worked,
        COALESCE(te.labor_cost, 0) as labor_cost,
        COALESCE(te.billable_hours, 0) as billable_hours,
        COALESCE(te.billable_value, 0) as billable_value,
        COALESCE(te.avg_hourly_rate, 0) as avg_hourly_rate,
        COALESCE(ex.expense_cost, 0) as expense_cost,
        COALESCE(ms.media_cost, 0) as media_cost,
        COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0) as total_cost,
        p.budget_amount - (COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0)) as gross_profit,
        CASE
          WHEN p.budget_amount > 0
          THEN ((p.budget_amount - (COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0))) / p.budget_amount * 100)
          ELSE 0
        END as gross_margin,
        CASE
          WHEN COALESCE(te.hours_worked, 0) > 0
          THEN p.budget_amount / te.hours_worked
          ELSE 0
        END as effective_rate,
        CASE
          WHEN p.budget_amount > 0
          THEN ((COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0)) / p.budget_amount * 100)
          ELSE 0
        END as budget_utilization,
        te.team_size,
        te.last_time_entry
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN (
        SELECT
          project_id,
          SUM(hours) as hours_worked,
          SUM(hours * hourly_rate) as labor_cost,
          SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours,
          SUM(CASE WHEN billable THEN hours * hourly_rate ELSE 0 END) as billable_value,
          AVG(hourly_rate) as avg_hourly_rate,
          COUNT(DISTINCT user_id) as team_size,
          MAX(date) as last_time_entry
        FROM time_entries
        GROUP BY project_id
      ) te ON p.id = te.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) ex ON p.id = ex.project_id
      LEFT JOIN (
        SELECT project_id, SUM(actual_spend) as media_cost
        FROM media_spend
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) ms ON p.id = ms.project_id
      ${whereClause}
      ORDER BY gross_profit DESC
    `, params)

    // Get overall summary
    const overallSummary = await queryOne(`
      SELECT
        COUNT(*) as total_projects,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_projects,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_projects,
        COALESCE(SUM(budget_amount), 0) as total_budget,
        COALESCE(SUM(COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0)), 0) as total_cost,
        COALESCE(SUM(budget_amount - (COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0))), 0) as total_profit,
        CASE
          WHEN COALESCE(SUM(budget_amount), 0) > 0
          THEN ((COALESCE(SUM(budget_amount), 0) - COALESCE(SUM(COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0) + COALESCE(ms.media_cost, 0)), 0)) / SUM(budget_amount) * 100)
          ELSE 0
        END as avg_margin,
        COALESCE(SUM(te.hours_worked), 0) as total_hours,
        COALESCE(AVG(te.avg_hourly_rate), 0) as avg_hourly_rate
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(hours) as hours_worked, SUM(hours * hourly_rate) as labor_cost, AVG(hourly_rate) as avg_hourly_rate
        FROM time_entries
        GROUP BY project_id
      ) te ON p.id = te.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) ex ON p.id = ex.project_id
      LEFT JOIN (
        SELECT project_id, SUM(actual_spend) as media_cost
        FROM media_spend
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) ms ON p.id = ms.project_id
      ${whereClause}
    `, params)

    // Get profitability by client
    const byClient = await queryRows(`
      SELECT
        c.id,
        c.name,
        COUNT(p.id) as project_count,
        COALESCE(SUM(p.budget_amount), 0) as total_revenue,
        COALESCE(SUM(COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0)), 0) as total_cost,
        COALESCE(SUM(p.budget_amount - (COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0))), 0) as total_profit,
        CASE
          WHEN COALESCE(SUM(p.budget_amount), 0) > 0
          THEN ((COALESCE(SUM(p.budget_amount), 0) - COALESCE(SUM(COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0)), 0)) / SUM(p.budget_amount) * 100)
          ELSE 0
        END as avg_margin,
        COALESCE(SUM(te.hours_worked), 0) as total_hours
      FROM agency_clients c
      JOIN projects p ON c.id = p.client_id
      LEFT JOIN (
        SELECT project_id, SUM(hours) as hours_worked, SUM(hours * hourly_rate) as labor_cost
        FROM time_entries
        GROUP BY project_id
      ) te ON p.id = te.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) ex ON p.id = ex.project_id
      ${whereClause ? whereClause.replace('WHERE', 'WHERE ').replace('p.client_id', 'c.id') : ''}
      GROUP BY c.id, c.name
      ORDER BY total_profit DESC
    `, params)

    // Get margin distribution
    const marginDistribution = await queryRows(`
      SELECT
        CASE
          WHEN margin < 0 THEN 'negative'
          WHEN margin >= 0 AND margin < 20 THEN 'low'
          WHEN margin >= 20 AND margin < 40 THEN 'moderate'
          WHEN margin >= 40 AND margin < 60 THEN 'good'
          ELSE 'excellent'
        END as range,
        COUNT(*) as count
      FROM (
        SELECT
          CASE
            WHEN p.budget_amount > 0
            THEN ((p.budget_amount - (COALESCE(te.labor_cost, 0) + COALESCE(ex.expense_cost, 0))) / p.budget_amount * 100)
            ELSE 0
          END as margin
        FROM projects p
        LEFT JOIN (
          SELECT project_id, SUM(hours * hourly_rate) as labor_cost
          FROM time_entries
          GROUP BY project_id
        ) te ON p.id = te.project_id
        LEFT JOIN (
          SELECT project_id, SUM(amount) as expense_cost
          FROM project_expenses
          WHERE project_id IS NOT NULL
          GROUP BY project_id
        ) ex ON p.id = ex.project_id
        ${whereClause}
      ) sub
      GROUP BY range
      ORDER BY
        CASE range
          WHEN 'negative' THEN 1
          WHEN 'low' THEN 2
          WHEN 'moderate' THEN 3
          WHEN 'good' THEN 4
          WHEN 'excellent' THEN 5
        END
    `, params)

    return {
      summary: {
        totalProjects: Number(overallSummary?.total_projects || 0),
        activeProjects: Number(overallSummary?.active_projects || 0),
        completedProjects: Number(overallSummary?.completed_projects || 0),
        totalBudget: Number(overallSummary?.total_budget || 0),
        totalCost: Number(overallSummary?.total_cost || 0),
        totalProfit: Number(overallSummary?.total_profit || 0),
        avgMargin: Number(overallSummary?.avg_margin || 0),
        totalHours: Number(overallSummary?.total_hours || 0),
        avgHourlyRate: Number(overallSummary?.avg_hourly_rate || 0)
      },
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        clientId: p.client_id,
        clientName: p.client_name,
        budgetAmount: Number(p.budget_amount || 0),
        budgetType: p.budget_type,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        hoursWorked: Number(p.hours_worked || 0),
        laborCost: Number(p.labor_cost || 0),
        billableHours: Number(p.billable_hours || 0),
        billableValue: Number(p.billable_value || 0),
        avgHourlyRate: Number(p.avg_hourly_rate || 0),
        expenseCost: Number(p.expense_cost || 0),
        mediaCost: Number(p.media_cost || 0),
        totalCost: Number(p.total_cost || 0),
        grossProfit: Number(p.gross_profit || 0),
        grossMargin: Number(p.gross_margin || 0),
        effectiveRate: Number(p.effective_rate || 0),
        budgetUtilization: Number(p.budget_utilization || 0),
        teamSize: Number(p.team_size || 0),
        lastTimeEntry: p.last_time_entry
      })),
      byClient: byClient.map(c => ({
        id: c.id,
        name: c.name,
        projectCount: Number(c.project_count || 0),
        totalRevenue: Number(c.total_revenue || 0),
        totalCost: Number(c.total_cost || 0),
        totalProfit: Number(c.total_profit || 0),
        avgMargin: Number(c.avg_margin || 0),
        totalHours: Number(c.total_hours || 0)
      })),
      marginDistribution: marginDistribution.map(m => ({
        range: m.range,
        count: Number(m.count || 0)
      }))
    }
  } catch (error) {
    console.error('Failed to fetch profitability report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch profitability report'
    })
  }
})
