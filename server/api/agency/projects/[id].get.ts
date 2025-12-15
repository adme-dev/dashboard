/**
 * Get Single Project with Full Details
 * GET /api/agency/projects/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Get project with client info and costs
    const project = await queryOne(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.budget_amount,
        p.budget_type,
        p.start_date,
        p.end_date,
        p.status,
        p.project_manager_id,
        p.created_at,
        p.updated_at,
        c.id as client_id,
        c.name as client_name,
        c.billing_type as client_billing_type,
        pm.name as project_manager_name,
        COALESCE(t.labor_cost, 0) as labor_cost,
        COALESCE(t.hours_worked, 0) as hours_worked,
        COALESCE(t.billable_hours, 0) as billable_hours,
        COALESCE(e.expense_cost, 0) as expense_cost,
        COALESCE(m.media_cost, 0) as media_cost,
        COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0) as total_cost,
        p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0)) as remaining_budget,
        CASE
          WHEN p.budget_amount > 0
          THEN ((p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0))) / p.budget_amount * 100)
          ELSE 0
        END as gross_margin
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      LEFT JOIN (
        SELECT project_id,
          SUM(hours * hourly_rate) as labor_cost,
          SUM(hours) as hours_worked,
          SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours
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
      WHERE p.id = $1
    `, [id])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Get recent time entries
    const timeEntries = await queryRows(`
      SELECT
        te.id, te.date, te.hours, te.hourly_rate, te.description, te.billable,
        tm.id as user_id, tm.name as user_name
      FROM time_entries te
      JOIN team_members tm ON te.user_id = tm.id
      WHERE te.project_id = $1
      ORDER BY te.date DESC
      LIMIT 10
    `, [id])

    // Get project expenses
    const expenses = await queryRows(`
      SELECT
        pe.id, pe.date, pe.amount, pe.description, pe.category,
        tm.name as submitted_by_name
      FROM project_expenses pe
      LEFT JOIN team_members tm ON pe.submitted_by = tm.id
      WHERE pe.project_id = $1
      ORDER BY pe.date DESC
      LIMIT 10
    `, [id])

    // Get related tasks count
    const taskStats = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
      FROM tasks
      WHERE project_id = $1
    `, [id])

    // Get related invoices
    const invoices = await queryRows(`
      SELECT
        i.id, i.invoice_number, i.total_amount, i.status, i.issue_date, i.due_date
      FROM invoices i
      WHERE i.project_id = $1
      ORDER BY i.issue_date DESC
      LIMIT 5
    `, [id])

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        clientId: project.client_id,
        clientName: project.client_name,
        clientBillingType: project.client_billing_type,
        projectManagerId: project.project_manager_id,
        projectManagerName: project.project_manager_name,
        budgetAmount: Number(project.budget_amount),
        budgetType: project.budget_type,
        startDate: project.start_date,
        endDate: project.end_date,
        status: project.status,
        laborCost: Number(project.labor_cost),
        hoursWorked: Number(project.hours_worked),
        billableHours: Number(project.billable_hours),
        expenseCost: Number(project.expense_cost),
        mediaCost: Number(project.media_cost),
        totalCost: Number(project.total_cost),
        remainingBudget: Number(project.remaining_budget),
        grossMargin: Number(project.gross_margin),
        createdAt: project.created_at,
        updatedAt: project.updated_at
      },
      timeEntries: timeEntries.map(te => ({
        id: te.id,
        date: te.date,
        hours: Number(te.hours),
        hourlyRate: Number(te.hourly_rate),
        description: te.description,
        billable: te.billable,
        userId: te.user_id,
        userName: te.user_name
      })),
      expenses: expenses.map(e => ({
        id: e.id,
        date: e.date,
        amount: Number(e.amount),
        description: e.description,
        category: e.category,
        submittedByName: e.submitted_by_name
      })),
      taskStats: {
        total: Number(taskStats?.total || 0),
        completed: Number(taskStats?.completed || 0),
        inProgress: Number(taskStats?.in_progress || 0)
      },
      invoices: invoices.map(i => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        totalAmount: Number(i.total_amount),
        status: i.status,
        issueDate: i.issue_date,
        dueDate: i.due_date
      }))
    }
  } catch (error: any) {
    console.error('Failed to fetch project:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project'
    })
  }
})
