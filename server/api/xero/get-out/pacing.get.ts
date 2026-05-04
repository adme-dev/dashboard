/**
 * GET /api/xero/get-out/pacing
 *
 * Returns the cumulative invoiced curve for the current month, the prior
 * month's curve at the same day-positions, and the linear daily-pace
 * line needed to hit target. Reads from xero_invoices_cache — sub-100ms.
 *
 * Response shape:
 *   {
 *     period: { year, month, daysInMonth, dayOfMonth },
 *     target: number,
 *     dailyPaceTarget: number,            // target / daysInMonth
 *     points: Array<{
 *       day: number,                       // 1..daysInMonth
 *       currentCumulative: number | null,  // null for future days
 *       priorCumulative: number | null,
 *       targetLine: number,                // running daily-pace target
 *     }>
 *   }
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

interface DailyRow {
  day: number
  cents: string | number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const priorMonthDate = new Date(year, month - 2, 1)
  const priorYear = priorMonthDate.getFullYear()
  const priorMonth = priorMonthDate.getMonth() + 1
  const priorDaysInMonth = new Date(priorYear, priorMonth, 0).getDate()
  const priorMonthStart = `${priorYear}-${String(priorMonth).padStart(2, '0')}-01`
  const priorMonthEnd = `${priorYear}-${String(priorMonth).padStart(2, '0')}-${String(priorDaysInMonth).padStart(2, '0')}`

  // Per-day invoiced totals for both months in one query each.
  const [currentDays, priorDays] = await Promise.all([
    queryRows<DailyRow>(
      `SELECT EXTRACT(DAY FROM date)::int AS day, SUM(total_cents)::text AS cents
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date BETWEEN $2::date AND $3::date
         GROUP BY EXTRACT(DAY FROM date)
         ORDER BY day`,
      [tenantId, monthStart, monthEnd],
    ),
    queryRows<DailyRow>(
      `SELECT EXTRACT(DAY FROM date)::int AS day, SUM(total_cents)::text AS cents
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date BETWEEN $2::date AND $3::date
         GROUP BY EXTRACT(DAY FROM date)
         ORDER BY day`,
      [tenantId, priorMonthStart, priorMonthEnd],
    ),
  ])

  // Index per-day totals
  const currentByDay = new Map<number, number>()
  for (const r of currentDays) currentByDay.set(r.day, Number(r.cents) / 100)
  const priorByDay = new Map<number, number>()
  for (const r of priorDays) priorByDay.set(r.day, Number(r.cents) / 100)

  // Target line + daily pace — derived from the configured Get Out target.
  const config = await loadGetOutConfig(tenantId)
  const target = summariseConfig(config).totalCents / 100
  const dailyPaceTarget = daysInMonth > 0 ? target / daysInMonth : 0

  // Build cumulative arrays. Future days for the current month are null
  // (we don't fake the future). Prior month uses min(day, priorDaysInMonth)
  // because Feb is shorter than Mar etc.
  const points: Array<{ day: number; currentCumulative: number | null; priorCumulative: number | null; targetLine: number }> = []
  let currentRunning = 0
  let priorRunning = 0
  for (let day = 1; day <= daysInMonth; day++) {
    if (day <= dayOfMonth) {
      currentRunning += currentByDay.get(day) ?? 0
    }
    // Only walk prior totals for days that exist in the prior month
    if (day <= priorDaysInMonth) {
      priorRunning += priorByDay.get(day) ?? 0
    }
    points.push({
      day,
      currentCumulative: day <= dayOfMonth
        ? Math.round(currentRunning * 100) / 100
        : null,
      priorCumulative: day <= priorDaysInMonth
        ? Math.round(priorRunning * 100) / 100
        : null,
      targetLine: Math.round(dailyPaceTarget * day * 100) / 100,
    })
  }

  // Working-day awareness: the agency invoices end-of-month, so the
  // operationally meaningful number is "$/working-day from here", not
  // calendar-day. Mon-Fri only.
  let workingDaysSoFar = 0
  let workingDaysRemaining = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay()
    const isWorkingDay = dow !== 0 && dow !== 6
    if (!isWorkingDay) continue
    if (day <= dayOfMonth) workingDaysSoFar++
    else workingDaysRemaining++
  }

  const requiredFromHere = Math.max(0, target - currentRunning)
  const requiredPerWorkingDay = workingDaysRemaining > 0
    ? requiredFromHere / workingDaysRemaining
    : 0
  // "If today's pace continues" projection — uses the current invoicing rate
  // per elapsed day rather than the linear daily-pace target.
  const projectedAtCurrentPace = dayOfMonth > 0
    ? (currentRunning / dayOfMonth) * daysInMonth
    : 0
  const projectedShortfall = target - projectedAtCurrentPace

  return {
    period: { year, month, daysInMonth, dayOfMonth, workingDaysSoFar, workingDaysRemaining },
    target: Math.round(target * 100) / 100,
    dailyPaceTarget: Math.round(dailyPaceTarget * 100) / 100,
    currentTotal: Math.round(currentRunning * 100) / 100,
    priorTotal: Math.round(priorRunning * 100) / 100,
    requiredFromHere: Math.round(requiredFromHere * 100) / 100,
    requiredPerWorkingDay: Math.round(requiredPerWorkingDay * 100) / 100,
    projectedAtCurrentPace: Math.round(projectedAtCurrentPace * 100) / 100,
    projectedShortfall: Math.round(projectedShortfall * 100) / 100,
    points,
  }
})
