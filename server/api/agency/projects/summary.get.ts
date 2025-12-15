/**
 * Projects Summary Endpoint
 * Returns aggregated project statistics and top projects for dashboard
 */

import { queryOne, queryRows } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  try {
    // Get status distribution
    const statusCounts = await queryOne(`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(*) as total
      FROM projects
    `)

    // Get financial summary
    const financials = await queryOne(`
      SELECT
        COALESCE(SUM(p.budget_amount), 0) as total_budget,
        COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0) as total_spent,
        COALESCE(SUM(p.budget_amount), 0) - (COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0)) as total_profit,
        CASE
          WHEN COALESCE(SUM(p.budget_amount), 0) > 0
          THEN ((COALESCE(SUM(p.budget_amount), 0) - (COALESCE(SUM(t.labor_cost), 0) + COALESCE(SUM(e.expense_cost), 0))) / SUM(p.budget_amount) * 100)
          ELSE 0
        END as avg_margin
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
      WHERE p.status IN ('active', 'completed')
    `)

    // Get top projects by budget utilization
    const topProjects = await queryRows(`
      SELECT
        p.id,
        p.name,
        c.name as client,
        p.budget_amount as budget,
        COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) as spent,
        CASE
          WHEN p.budget_amount > 0
          THEN ((p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0))) / p.budget_amount * 100)
          ELSE 0
        END as margin,
        p.status
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
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
      ORDER BY p.budget_amount DESC
      LIMIT 5
    `)

    // Get projects at risk (over 80% budget used)
    const atRisk = await queryRows(`
      SELECT
        p.id,
        p.name,
        CASE
          WHEN p.budget_amount > 0
          THEN ((COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0)) / p.budget_amount * 100)
          ELSE 0
        END as budget_used,
        CASE
          WHEN p.end_date IS NOT NULL
          THEN GREATEST(0, EXTRACT(DAY FROM p.end_date - CURRENT_DATE))
          ELSE NULL
        END as days_remaining
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
      ORDER BY budget_used DESC
      LIMIT 5
    `)

    // Get recently completed projects
    const recentlyCompleted = await queryRows(`
      SELECT
        p.id,
        p.name,
        c.name as client,
        CASE
          WHEN p.budget_amount > 0
          THEN ((p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0))) / p.budget_amount * 100)
          ELSE 0
        END as final_margin,
        p.end_date as completed_date
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
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
      WHERE p.status = 'completed'
      ORDER BY p.end_date DESC
      LIMIT 5
    `)

    return {
      // Status distribution
      active: Number(statusCounts?.active) || 0,
      draft: Number(statusCounts?.draft) || 0,
      onHold: Number(statusCounts?.on_hold) || 0,
      completed: Number(statusCounts?.completed) || 0,
      cancelled: Number(statusCounts?.cancelled) || 0,
      total: Number(statusCounts?.total) || 0,

      // Financial summary
      totalBudget: Number(financials?.total_budget) || 0,
      totalSpent: Number(financials?.total_spent) || 0,
      totalProfit: Number(financials?.total_profit) || 0,
      avgMargin: Number(financials?.avg_margin) || 0,

      // Top projects
      topProjects: topProjects.map(p => ({
        id: p.id,
        name: p.name,
        client: p.client,
        budget: Number(p.budget),
        spent: Number(p.spent),
        margin: Number(p.margin),
        status: p.status
      })),

      // Projects at risk
      atRisk: atRisk.map(p => ({
        id: p.id,
        name: p.name,
        budgetUsed: Math.round(Number(p.budget_used) * 10) / 10,
        daysRemaining: p.days_remaining !== null ? Number(p.days_remaining) : null
      })),

      // Recently completed
      recentlyCompleted: recentlyCompleted.map(p => ({
        id: p.id,
        name: p.name,
        client: p.client,
        finalMargin: Math.round(Number(p.final_margin) * 10) / 10,
        completedDate: p.completed_date
      }))
    }
  } catch (error) {
    console.error('Failed to fetch project summary:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project summary'
    })
  }
})
