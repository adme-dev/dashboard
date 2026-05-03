/**
 * GET /api/customers/[contactId]/work
 *
 * Internal cross-system view: looks up the agency_clients row by
 * xero_contact_id, then returns active projects, recent time entries,
 * and monthly hours.
 *
 * Returns { linked: false } if the Xero contact has not been mirrored
 * into agency_clients yet (the manual sync handles that mirroring).
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'

interface ClientRow {
  id: string
  name: string
  billing_type: string
  retainer_amount: string | number | null
  hourly_rate: string | number | null
  is_active: boolean
}

interface ProjectRow {
  id: string
  name: string
  status: string
  budget_type: string | null
  budget_amount: string | number | null
  start_date: string | null
  end_date: string | null
  total_hours: string | number | null
  labor_cost: string | number | null
  total_cost: string | number | null
}

interface TimeEntryRow {
  id: string
  date: string
  hours: string | number
  description: string | null
  billable: boolean
  project_name: string
  user_name: string
  hourly_rate: string | number
}

interface MonthlyHoursRow {
  month: string
  hours: string | number
  amount_cents: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  // Resolve the internal client. If there's no link, surface that to the UI
  // so it can show a "Match this Xero contact to a client" CTA.
  const client = await queryOne<ClientRow>(
    `SELECT id, name, billing_type, retainer_amount, hourly_rate, is_active
       FROM agency_clients
       WHERE xero_contact_id = $1
       LIMIT 1`,
    [contactId],
  )

  if (!client) {
    return {
      linked: false,
      client: null,
      projects: [],
      recentTimeEntries: [],
      monthlyHours: [],
      summary: {
        activeProjects: 0,
        completedProjects: 0,
        totalProjects: 0,
        hoursThisMonth: 0,
        billableThisMonth: 0,
      },
    }
  }

  const projects = await queryRows<ProjectRow>(
    `SELECT
       p.id, p.name, p.status, p.budget_type, p.budget_amount,
       p.start_date, p.end_date,
       COALESCE(t.total_hours, 0) AS total_hours,
       COALESCE(t.labor_cost, 0)  AS labor_cost,
       COALESCE(t.labor_cost, 0)  AS total_cost
     FROM projects p
     LEFT JOIN (
       SELECT project_id,
              SUM(hours)                  AS total_hours,
              SUM(hours * hourly_rate)    AS labor_cost
         FROM time_entries
         GROUP BY project_id
     ) t ON p.id = t.project_id
     WHERE p.client_id = $1
     ORDER BY
       CASE WHEN p.status = 'active' THEN 0 ELSE 1 END,
       p.created_at DESC`,
    [client.id],
  )

  const recentTime = await queryRows<TimeEntryRow>(
    `SELECT te.id, te.date, te.hours, te.description, te.billable,
            te.hourly_rate,
            p.name AS project_name, tm.name AS user_name
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
       JOIN team_members tm ON te.user_id = tm.id
       WHERE p.client_id = $1
       ORDER BY te.date DESC
       LIMIT 15`,
    [client.id],
  )

  // 6-month time bucket for the workload sparkline
  const monthly = await queryRows<MonthlyHoursRow>(
    `SELECT TO_CHAR(DATE_TRUNC('month', te.date), 'YYYY-MM') AS month,
            SUM(te.hours)::numeric                            AS hours,
            ROUND(SUM(te.hours * te.hourly_rate) * 100)::bigint AS amount_cents
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
       WHERE p.client_id = $1
         AND te.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
       GROUP BY DATE_TRUNC('month', te.date)
       ORDER BY DATE_TRUNC('month', te.date) ASC`,
    [client.id],
  )

  const activeProjects = projects.filter(p => p.status === 'active').length
  const completedProjects = projects.filter(p => p.status === 'completed').length

  // This month's workload
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  let hoursThisMonth = 0
  let billableThisMonth = 0
  for (const te of recentTime) {
    const d = new Date(te.date)
    if (d >= monthStart) {
      hoursThisMonth += n(te.hours)
      if (te.billable) billableThisMonth += n(te.hours)
    }
  }

  return {
    linked: true,
    client: {
      id: client.id,
      name: client.name,
      billingType: client.billing_type,
      retainerAmount: client.retainer_amount != null ? Number(client.retainer_amount) : null,
      hourlyRate: client.hourly_rate != null ? Number(client.hourly_rate) : null,
      isActive: client.is_active,
    },
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      budgetType: p.budget_type,
      budgetAmount: n(p.budget_amount),
      startDate: p.start_date,
      endDate: p.end_date,
      totalHours: n(p.total_hours),
      laborCost: n(p.labor_cost),
      totalCost: n(p.total_cost),
      margin: n(p.budget_amount) > 0
        ? ((n(p.budget_amount) - n(p.total_cost)) / n(p.budget_amount)) * 100
        : 0,
    })),
    recentTimeEntries: recentTime.map(te => ({
      id: te.id,
      date: te.date,
      hours: n(te.hours),
      hourlyRate: n(te.hourly_rate),
      amount: n(te.hours) * n(te.hourly_rate),
      description: te.description,
      billable: te.billable,
      projectName: te.project_name,
      userName: te.user_name,
    })),
    monthlyHours: monthly.map(m => ({
      month: m.month,
      hours: n(m.hours),
      amountCents: n(m.amount_cents),
    })),
    summary: {
      activeProjects,
      completedProjects,
      totalProjects: projects.length,
      hoursThisMonth: Math.round(hoursThisMonth * 10) / 10,
      billableThisMonth: Math.round(billableThisMonth * 10) / 10,
    },
  }
})
