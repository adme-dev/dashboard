/**
 * Get timesheet detail
 * GET /api/agency/time/timesheets/:id
 *
 * Returns the timesheet period with all its time entries.
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const timesheetId = getRouterParam(event, 'id')

  if (!timesheetId) {
    throw createError({ statusCode: 400, statusMessage: 'Timesheet ID is required' })
  }

  const timesheet = await queryOne(`
    SELECT
      tp.*,
      tm.name AS user_name,
      tm.email AS user_email,
      approver.name AS approver_name
    FROM timesheet_periods tp
    LEFT JOIN team_members tm ON tp.user_id = tm.id
    LEFT JOIN team_members approver ON tp.approved_by = approver.id
    WHERE tp.id = $1
  `, [timesheetId])

  if (!timesheet) {
    throw createError({ statusCode: 404, statusMessage: 'Timesheet not found' })
  }

  // Access control: only the user or a manager can view
  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')
  if (timesheet.user_id !== user.id && !isManager) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to view this timesheet' })
  }

  // Fetch all entries in this period
  const entries = await queryRows(`
    SELECT
      te.id,
      te.user_id,
      te.project_id,
      te.task_id,
      te.date,
      te.hours,
      te.billable,
      te.hourly_rate,
      te.description,
      te.status,
      te.created_at,
      p.name AS project_name,
      c.name AS client_name,
      t.title AS task_title
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON te.task_id = t.id
    WHERE te.user_id = $1 AND te.date >= $2 AND te.date <= $3
    ORDER BY te.date ASC, te.created_at ASC
  `, [timesheet.user_id, timesheet.period_start, timesheet.period_end])

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
      approvedAt: timesheet.approved_at,
      approvedBy: timesheet.approved_by,
      rejectionReason: timesheet.rejection_reason,
      createdAt: timesheet.created_at,
      user: {
        id: timesheet.user_id,
        name: timesheet.user_name,
        email: timesheet.user_email
      },
      approver: timesheet.approved_by ? {
        id: timesheet.approved_by,
        name: timesheet.approver_name
      } : null
    },
    entries: entries.map(e => ({
      id: e.id,
      projectId: e.project_id,
      taskId: e.task_id,
      date: e.date,
      hours: Number(e.hours),
      billable: e.billable,
      hourlyRate: Number(e.hourly_rate),
      description: e.description,
      status: e.status || 'draft',
      createdAt: e.created_at,
      project: e.project_id ? {
        id: e.project_id,
        name: e.project_name,
        clientName: e.client_name
      } : null,
      task: e.task_id ? {
        id: e.task_id,
        title: e.task_title
      } : null
    }))
  }
})
