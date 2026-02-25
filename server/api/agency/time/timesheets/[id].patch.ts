/**
 * Approve or reject a timesheet
 * PATCH /api/agency/time/timesheets/:id
 *
 * Body:
 * - action: 'approve' | 'reject'
 * - rejectionReason: string (required when rejecting)
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner', 'lead'])
  const timesheetId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!timesheetId) {
    throw createError({ statusCode: 400, statusMessage: 'Timesheet ID is required' })
  }

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'action must be "approve" or "reject"' })
  }

  if (body.action === 'reject' && !body.rejectionReason) {
    throw createError({ statusCode: 400, statusMessage: 'rejectionReason is required when rejecting' })
  }

  // Fetch the timesheet
  const timesheet = await queryOne(`
    SELECT * FROM timesheet_periods WHERE id = $1
  `, [timesheetId])

  if (!timesheet) {
    throw createError({ statusCode: 404, statusMessage: 'Timesheet not found' })
  }

  if (timesheet.status !== 'submitted') {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot ${body.action} a timesheet with status "${timesheet.status}"`
    })
  }

  if (body.action === 'approve') {
    // Approve the timesheet
    await queryOne(`
      UPDATE timesheet_periods
      SET status = 'approved',
          approved_at = NOW(),
          approved_by = $2
      WHERE id = $1
      RETURNING *
    `, [timesheetId, user.id])

    // Update all entries in the period to approved
    await execute(`
      UPDATE time_entries
      SET status = 'approved', approved = true, approved_at = NOW(), approved_by = $4
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND status = 'submitted'
    `, [timesheet.user_id, timesheet.period_start, timesheet.period_end, user.id])

    // Re-fetch with user info
    const result = await queryOne(`
      SELECT tp.*, tm.name AS user_name, approver.name AS approver_name
      FROM timesheet_periods tp
      LEFT JOIN team_members tm ON tp.user_id = tm.id
      LEFT JOIN team_members approver ON tp.approved_by = approver.id
      WHERE tp.id = $1
    `, [timesheetId])

    return {
      timesheet: {
        id: result.id,
        userId: result.user_id,
        periodStart: result.period_start,
        periodEnd: result.period_end,
        status: result.status,
        totalHours: Number(result.total_hours || 0),
        billableHours: Number(result.billable_hours || 0),
        submittedAt: result.submitted_at,
        approvedAt: result.approved_at,
        approvedBy: result.approved_by,
        rejectionReason: result.rejection_reason,
        user: { id: result.user_id, name: result.user_name },
        approver: { id: result.approved_by, name: result.approver_name }
      }
    }
  } else {
    // Reject the timesheet
    await queryOne(`
      UPDATE timesheet_periods
      SET status = 'rejected',
          rejection_reason = $2
      WHERE id = $1
      RETURNING *
    `, [timesheetId, body.rejectionReason])

    // Revert entries back to draft
    await execute(`
      UPDATE time_entries
      SET status = 'draft', submitted_at = NULL
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND status = 'submitted'
    `, [timesheet.user_id, timesheet.period_start, timesheet.period_end])

    const result = await queryOne(`
      SELECT tp.*, tm.name AS user_name
      FROM timesheet_periods tp
      LEFT JOIN team_members tm ON tp.user_id = tm.id
      WHERE tp.id = $1
    `, [timesheetId])

    return {
      timesheet: {
        id: result.id,
        userId: result.user_id,
        periodStart: result.period_start,
        periodEnd: result.period_end,
        status: result.status,
        totalHours: Number(result.total_hours || 0),
        billableHours: Number(result.billable_hours || 0),
        submittedAt: result.submitted_at,
        rejectionReason: result.rejection_reason,
        user: { id: result.user_id, name: result.user_name }
      }
    }
  }
})
