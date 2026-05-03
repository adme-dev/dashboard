/**
 * GET /api/xero/get-out/unbilled-wip
 *
 * Work-in-progress that's been done but not yet invoiced. Computed from
 * billable time_entries WHERE invoiced = false. Top-N projects so the
 * UI can show "the forgotten money".
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface ProjectWipRow {
  project_id: string
  project_name: string
  client_name: string
  hours: string | number
  amount_cents: string | number
  oldest_entry_date: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  // Headline totals — single query, fast even on large books
  const totals = await queryOne<{ hours: string; amount_cents: string; project_count: number }>(
    `SELECT
       COALESCE(SUM(te.hours), 0)::text AS hours,
       (COALESCE(SUM(te.hours * te.hourly_rate), 0) * 100)::bigint::text AS amount_cents,
       COUNT(DISTINCT te.project_id)::int AS project_count
     FROM time_entries te
     WHERE te.billable = true AND te.invoiced = false`,
  )

  // Top 10 projects with unbilled WIP
  const projects = await queryRows<ProjectWipRow>(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       ac.name AS client_name,
       SUM(te.hours)::text AS hours,
       (SUM(te.hours * te.hourly_rate) * 100)::bigint::text AS amount_cents,
       MIN(te.date)::text AS oldest_entry_date
     FROM time_entries te
     JOIN projects p ON te.project_id = p.id
     JOIN agency_clients ac ON p.client_id = ac.id
     WHERE te.billable = true AND te.invoiced = false
     GROUP BY p.id, p.name, ac.name
     HAVING SUM(te.hours) > 0
     ORDER BY SUM(te.hours * te.hourly_rate) DESC
     LIMIT 10`,
  )

  const totalHours = n(totals?.hours)
  const totalAmount = n(totals?.amount_cents) / 100

  return {
    summary: {
      totalHours: Math.round(totalHours * 10) / 10,
      totalAmount: Math.round(totalAmount * 100) / 100,
      projectCount: Number(totals?.project_count ?? 0),
    },
    projects: projects.map((p) => ({
      id: p.project_id,
      name: p.project_name,
      clientName: p.client_name,
      hours: Math.round(n(p.hours) * 10) / 10,
      amount: Math.round((n(p.amount_cents) / 100) * 100) / 100,
      oldestEntryDate: p.oldest_entry_date,
      ageDays: p.oldest_entry_date
        ? Math.floor((Date.now() - new Date(p.oldest_entry_date).getTime()) / 86400_000)
        : 0,
    })),
  }
})
