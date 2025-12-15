/**
 * Projects List Endpoint
 * Returns all projects with profitability calculations from Postgres
 */

import { queryRows } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { status, clientId } = query

  try {
    // Build query with optional filters
    let sql = `
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
        COALESCE(t.labor_cost, 0) as labor_cost,
        COALESCE(t.hours_worked, 0) as hours_worked,
        COALESCE(e.expense_cost, 0) as expense_cost,
        COALESCE(m.media_cost, 0) as media_cost,
        COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0) as total_cost,
        p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0)) as gross_profit,
        CASE
          WHEN p.budget_amount > 0
          THEN ((p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0))) / p.budget_amount * 100)
          ELSE 0
        END as gross_margin,
        CASE
          WHEN COALESCE(t.hours_worked, 0) > 0
          THEN p.budget_amount / t.hours_worked
          ELSE 0
        END as effective_rate
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN (
        SELECT project_id, SUM(hours * hourly_rate) as labor_cost, SUM(hours) as hours_worked
        FROM time_entries
        GROUP BY project_id
      ) t ON p.id = t.project_id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as expense_cost
        FROM project_expenses
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) e ON p.id = e.project_id
      LEFT JOIN (
        SELECT project_id, SUM(actual_spend) as media_cost
        FROM media_spend
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      ) m ON p.id = m.project_id
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1

    if (status && status !== 'all') {
      sql += ` AND p.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (clientId) {
      sql += ` AND p.client_id = $${paramIndex}`
      params.push(clientId)
      paramIndex++
    }

    sql += ' ORDER BY p.start_date DESC'

    const projects = await queryRows(sql, params)

    // Transform to camelCase
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      clientId: p.client_id,
      clientName: p.client_name,
      budgetAmount: Number(p.budget_amount),
      budgetType: p.budget_type,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
      laborCost: Number(p.labor_cost),
      hoursWorked: Number(p.hours_worked),
      expenseCost: Number(p.expense_cost),
      mediaCost: Number(p.media_cost),
      totalCost: Number(p.total_cost),
      grossProfit: Number(p.gross_profit),
      grossMargin: Number(p.gross_margin),
      effectiveRate: Number(p.effective_rate),
    }))
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch projects'
    })
  }
})
