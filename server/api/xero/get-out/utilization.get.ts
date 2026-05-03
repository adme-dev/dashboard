/**
 * GET /api/xero/get-out/utilization
 *
 * Utilization rate MTD: billable hours ÷ available hours, computed from
 * time_entries. Per-team-member breakdown + overall.
 *
 * Industry targets (Parakeeto): producers 75-85%, agency-wide 65-80%
 * annualised. We surface the raw % and band for both.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface UtilRow {
  user_id: string
  user_name: string
  total_hours: string | number
  billable_hours: string | number
  billable_amount_cents: string | number
}

interface CapacityRow {
  billable_team_size: string | number
  total_weekly_capacity: string | number | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

// Default daily/weekly hours used when a team member has no `weekly_capacity`
// configured. 7.5h × 5 working days = 37.5h is a common Australian agency
// baseline. A team member's own `weekly_capacity` overrides this.
const DEFAULT_DAILY_HOURS = 7.5
const DEFAULT_WEEKLY_HOURS = DEFAULT_DAILY_HOURS * 5

function workingDaysSoFar(): number {
  const today = new Date()
  let count = 0
  for (let day = 1; day <= today.getDate(); day++) {
    const d = new Date(today.getFullYear(), today.getMonth(), day)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  // Team capacity is the denominator for utilization. Active team members
  // explicitly marked non-billable (target_utilization = 0 — typically admin/HR)
  // are excluded so the headline % isn't dragged down by people who aren't
  // expected to log billable hours.
  const [rows, capacity] = await Promise.all([
    queryRows<UtilRow>(
      `SELECT
         te.user_id,
         tm.name AS user_name,
         SUM(te.hours)::text AS total_hours,
         SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END)::text AS billable_hours,
         (SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END) * 100)::bigint::text
           AS billable_amount_cents
       FROM time_entries te
       JOIN team_members tm ON te.user_id = tm.id
       WHERE te.date BETWEEN $1::date AND $2::date
       GROUP BY te.user_id, tm.name
       ORDER BY billable_hours DESC NULLS LAST`,
      [monthStart, monthEnd],
    ),
    queryRows<CapacityRow>(
      `SELECT
         COUNT(*)::text AS billable_team_size,
         COALESCE(SUM(COALESCE(weekly_capacity, $1)), 0)::text AS total_weekly_capacity
       FROM team_members
       WHERE is_active = true
         AND (target_utilization IS NULL OR target_utilization > 0)`,
      [DEFAULT_WEEKLY_HOURS],
    ),
  ])

  const workingDays = workingDaysSoFar()
  const billableTeamSize = Number(capacity[0]?.billable_team_size ?? 0)
  const totalWeeklyCapacity = Number(capacity[0]?.total_weekly_capacity ?? 0)
  // Spread weekly capacity over a 5-day work-week to derive daily, then
  // multiply by working days elapsed this month for available hours.
  const totalAvailable = billableTeamSize > 0 && totalWeeklyCapacity > 0
    ? (totalWeeklyCapacity / 5) * workingDays
    : 0
  // Per-user "available" still uses the default — granular caps would
  // need the per-user weekly_capacity, but we don't surface that here.
  const availableHoursPerUser = workingDays * DEFAULT_DAILY_HOURS

  let totalLogged = 0
  let totalBillable = 0
  let totalBillableAmount = 0
  const members = rows.map((r) => {
    const logged = n(r.total_hours)
    const billable = n(r.billable_hours)
    const billableAmount = n(r.billable_amount_cents) / 100
    totalLogged += logged
    totalBillable += billable
    totalBillableAmount += billableAmount

    const utilizationPct = availableHoursPerUser > 0
      ? Math.round((billable / availableHoursPerUser) * 1000) / 10
      : 0
    return {
      userId: r.user_id,
      userName: r.user_name,
      totalHours: Math.round(logged * 10) / 10,
      billableHours: Math.round(billable * 10) / 10,
      availableHours: availableHoursPerUser,
      billableAmount: Math.round(billableAmount * 100) / 100,
      utilizationPct,
    }
  })

  // Agency-wide utilization uses true team capacity (active + billable team
  // members), so the headline % stays meaningful even when no time has been
  // logged yet this month.
  const overallUtilization = totalAvailable > 0
    ? Math.round((totalBillable / totalAvailable) * 1000) / 10
    : 0

  // Average billable rate (ABR) — a Parakeeto staple. AGI proxy ÷ billable hours.
  const avgBillableRate = totalBillable > 0
    ? Math.round((totalBillableAmount / totalBillable) * 100) / 100
    : 0

  let band: 'low' | 'mixed' | 'healthy' | 'high' = 'low'
  if (overallUtilization >= 80) band = 'high'
  else if (overallUtilization >= 65) band = 'healthy'
  else if (overallUtilization >= 50) band = 'mixed'

  return {
    period: { monthStart, monthEnd, workingDaysSoFar: workingDays },
    overall: {
      totalLogged: Math.round(totalLogged * 10) / 10,
      totalBillable: Math.round(totalBillable * 10) / 10,
      totalAvailable: Math.round(totalAvailable * 10) / 10,
      billableTeamSize,
      utilizationPct: overallUtilization,
      band,
      avgBillableRate,
      billableAmount: Math.round(totalBillableAmount * 100) / 100,
    },
    members,
  }
})
