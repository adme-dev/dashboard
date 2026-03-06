/**
 * Get timesheet gaps and warnings
 * GET /api/agency/time/timesheets/gaps
 *
 * Returns:
 * - missingSubmitters: active team members with no submitted/approved timesheet for the given period
 * - timesheetWarnings: per-timesheet warnings for submitted timesheets (missing days, low hours, etc.)
 *
 * Query params:
 * - periodStart: Start of period (YYYY-MM-DD) — defaults to last Monday
 * - periodEnd: End of period (YYYY-MM-DD) — defaults to last Sunday
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner', 'lead'])

  const query = getQuery(event)

  // Default to last complete week (Mon-Sun)
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)

  const periodStart = String(query.periodStart || lastMonday.toISOString().slice(0, 10))
  const periodEnd = String(query.periodEnd || lastSunday.toISOString().slice(0, 10))

  // Find active team members with no submitted/approved timesheet for this period
  const missingSubmitters = await queryRows(`
    SELECT tm.id, tm.name, tm.email, tm.role
    FROM team_members tm
    WHERE tm.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM timesheet_periods tp
        WHERE tp.user_id = tm.id
          AND tp.period_start = $1
          AND tp.period_end = $2
          AND tp.status IN ('submitted', 'approved')
      )
    ORDER BY tm.name ASC
  `, [periodStart, periodEnd])

  // Get submitted timesheets with entry-level detail for warning calculation
  const timesheetEntryStats = await queryRows(`
    SELECT
      tp.id AS timesheet_id,
      tp.user_id,
      tp.total_hours,
      tp.period_start,
      tp.period_end,
      COALESCE(
        json_agg(
          json_build_object(
            'date', te.date,
            'hours', te.hours,
            'project_id', te.project_id,
            'description', te.description
          )
        ) FILTER (WHERE te.id IS NOT NULL),
        '[]'
      ) AS entries
    FROM timesheet_periods tp
    LEFT JOIN time_entries te
      ON te.user_id = tp.user_id
      AND te.date >= tp.period_start
      AND te.date <= tp.period_end
    WHERE tp.status = 'submitted'
    GROUP BY tp.id, tp.user_id, tp.total_hours, tp.period_start, tp.period_end
  `, [])

  // Calculate warnings per timesheet
  const timesheetWarnings: Record<string, { type: string; message: string }[]> = {}

  for (const ts of timesheetEntryStats) {
    const warnings: { type: string; message: string }[] = []
    const entries = ts.entries as any[]

    // Count unique dates with entries
    const datesWithEntries = new Set(entries.map(e => String(e.date).slice(0, 10)))

    // Calculate expected weekdays in period
    const start = new Date(ts.period_start)
    const end = new Date(ts.period_end)
    const expectedWeekdays: string[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const day = cursor.getDay()
      if (day !== 0 && day !== 6) { // Mon-Fri
        expectedWeekdays.push(cursor.toISOString().slice(0, 10))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    // Missing weekdays
    const missingDays = expectedWeekdays.filter(d => !datesWithEntries.has(d))
    if (missingDays.length > 0) {
      warnings.push({
        type: 'missing_days',
        message: `${missingDays.length} weekday${missingDays.length > 1 ? 's' : ''} with no entries`
      })
    }

    // Low daily hours (< 7h on any weekday)
    const hoursByDate: Record<string, number> = {}
    for (const entry of entries) {
      const d = String(entry.date).slice(0, 10)
      hoursByDate[d] = (hoursByDate[d] || 0) + Number(entry.hours)
    }
    const lowDays = expectedWeekdays.filter(d => {
      const h = hoursByDate[d]
      return h !== undefined && h > 0 && h < 7
    })
    if (lowDays.length > 0) {
      warnings.push({
        type: 'low_hours',
        message: `${lowDays.length} day${lowDays.length > 1 ? 's' : ''} with under 7h logged`
      })
    }

    // Entries without project
    const noProject = entries.filter(e => !e.project_id)
    if (noProject.length > 0) {
      warnings.push({
        type: 'no_project',
        message: `${noProject.length} entr${noProject.length > 1 ? 'ies' : 'y'} without a project`
      })
    }

    // Low total hours for a full week (< 35h)
    const totalHours = Number(ts.total_hours || 0)
    if (expectedWeekdays.length >= 5 && totalHours < 35) {
      warnings.push({
        type: 'low_total',
        message: `Only ${totalHours.toFixed(1)}h total for a full week`
      })
    }

    if (warnings.length > 0) {
      timesheetWarnings[ts.timesheet_id] = warnings
    }
  }

  return {
    periodStart,
    periodEnd,
    missingSubmitters: missingSubmitters.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role
    })),
    timesheetWarnings
  }
})
