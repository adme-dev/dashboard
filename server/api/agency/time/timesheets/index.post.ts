/**
 * Submit a timesheet
 * POST /api/agency/time/timesheets
 *
 * Body:
 * - periodStart: Start of the week (YYYY-MM-DD)
 * - periodEnd: End of the week (YYYY-MM-DD)
 */

import { queryOne, execute, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  if (!body.periodStart || !body.periodEnd) {
    throw createError({
      statusCode: 400,
      statusMessage: 'periodStart and periodEnd are required'
    })
  }

  // Check for existing submitted/approved timesheet in this period
  const existing = await queryOne(`
    SELECT id, status FROM timesheet_periods
    WHERE user_id = $1
      AND period_start = $2
      AND period_end = $3
      AND status IN ('submitted', 'approved')
  `, [user.id, body.periodStart, body.periodEnd])

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: `A timesheet for this period is already ${existing.status}`
    })
  }

  // Check that entries exist for this period
  const entryCount = await queryOne(`
    SELECT COUNT(*) AS cnt FROM time_entries
    WHERE user_id = $1 AND date >= $2 AND date <= $3
  `, [user.id, body.periodStart, body.periodEnd])

  if (!entryCount || Number(entryCount.cnt) === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No time entries found for this period'
    })
  }

  // Calculate totals for the period
  const totals = await queryOne(`
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN billable THEN hours ELSE 0 END), 0) AS billable_hours
    FROM time_entries
    WHERE user_id = $1 AND date >= $2 AND date <= $3
  `, [user.id, body.periodStart, body.periodEnd])

  // If there's a rejected timesheet for this period, update it instead of creating new
  const rejected = await queryOne(`
    SELECT id FROM timesheet_periods
    WHERE user_id = $1
      AND period_start = $2
      AND period_end = $3
      AND status = 'rejected'
  `, [user.id, body.periodStart, body.periodEnd])

  // Use transaction to ensure timesheet + entry status updates are atomic
  const timesheet = await transaction(async (client) => {
    let ts: any

    if (rejected) {
      // Re-submit the rejected timesheet
      const result = await client.query(`
        UPDATE timesheet_periods
        SET status = 'submitted',
            submitted_at = NOW(),
            rejection_reason = NULL,
            total_hours = $2,
            billable_hours = $3
        WHERE id = $1
        RETURNING *
      `, [rejected.id, totals.total_hours, totals.billable_hours])
      ts = result.rows[0]
    } else {
      // Create new timesheet period
      const result = await client.query(`
        INSERT INTO timesheet_periods (
          user_id, period_start, period_end, status,
          total_hours, billable_hours, submitted_at
        ) VALUES ($1, $2, $3, 'submitted', $4, $5, NOW())
        RETURNING *
      `, [
        user.id, body.periodStart, body.periodEnd,
        totals.total_hours, totals.billable_hours
      ])
      ts = result.rows[0]
    }

    // Update all entries in the period to submitted status
    await client.query(`
      UPDATE time_entries
      SET status = 'submitted', submitted_at = NOW()
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND status = 'draft'
    `, [user.id, body.periodStart, body.periodEnd])

    return ts
  })

  return {
    timesheet: {
      id: timesheet.id,
      userId: timesheet.user_id,
      periodStart: timesheet.period_start,
      periodEnd: timesheet.period_end,
      status: timesheet.status,
      totalHours: Number(timesheet.total_hours || 0),
      billableHours: Number(timesheet.billable_hours || 0),
      submittedAt: timesheet.submitted_at,
      createdAt: timesheet.created_at
    }
  }
})
