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

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

// Available hours per working day. 7.5h is a common Australian agency
// default — adjust if the tenant configures something different later.
const DEFAULT_DAILY_HOURS = 7.5

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

  const rows = await queryRows<UtilRow>(
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
  )

  const workingDays = workingDaysSoFar()
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

  // Agency-wide utilization across the people who logged ANY time this
  // month. Doesn't account for staff on leave or non-time-tracking roles
  // (admin, HR) — for the headline number we want to compare what
  // producers do, not what admin does.
  const totalAvailable = members.length * availableHoursPerUser
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
      totalAvailable,
      utilizationPct: overallUtilization,
      band,
      avgBillableRate,
      billableAmount: Math.round(totalBillableAmount * 100) / 100,
    },
    members,
  }
})
