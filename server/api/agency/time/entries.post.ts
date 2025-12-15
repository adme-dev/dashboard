/**
 * Create a time entry
 * POST /api/agency/time/entries
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Validate required fields
  if (!body.date) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Date is required'
    })
  }

  if (!body.hours || body.hours <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Hours must be greater than 0'
    })
  }

  if (body.hours > 24) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Hours cannot exceed 24 per entry'
    })
  }

  // Determine user_id (can log for self, or managers can log for others)
  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')
  const targetUserId = (body.userId && isManager) ? body.userId : user.id

  // Get hourly rate (from body, user's default, project rate, or client rate)
  let hourlyRate = body.hourlyRate || body.hourly_rate

  if (!hourlyRate) {
    // Try to get user's default rate
    const teamMember = await queryOne(
      'SELECT default_hourly_rate FROM team_members WHERE id = $1',
      [targetUserId]
    )
    hourlyRate = teamMember?.default_hourly_rate

    // If still no rate and project exists, try project's client rate
    if (!hourlyRate && body.projectId) {
      const project = await queryOne(`
        SELECT c.hourly_rate
        FROM projects p
        JOIN agency_clients c ON p.client_id = c.id
        WHERE p.id = $1
      `, [body.projectId])
      hourlyRate = project?.hourly_rate
    }
  }

  if (!hourlyRate) {
    hourlyRate = 0 // Default to 0 if no rate found
  }

  // Create the time entry
  const entry = await queryOne(`
    INSERT INTO time_entries (
      user_id,
      project_id,
      task_id,
      date,
      hours,
      billable,
      hourly_rate,
      description,
      notes,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    targetUserId,
    body.projectId || body.project_id || null,
    body.taskId || body.task_id || null,
    body.date,
    body.hours,
    body.billable !== undefined ? body.billable : true,
    hourlyRate,
    body.description || null,
    body.notes || null,
    body.status || 'draft'
  ])

  // Fetch related data for response
  const fullEntry = await queryOne(`
    SELECT
      te.*,
      tm.name AS user_name,
      tm.email AS user_email,
      p.name AS project_name,
      c.name AS client_name,
      t.title AS task_title
    FROM time_entries te
    LEFT JOIN team_members tm ON te.user_id = tm.id
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON te.task_id = t.id
    WHERE te.id = $1
  `, [entry.id])

  return {
    entry: {
      id: fullEntry.id,
      userId: fullEntry.user_id,
      projectId: fullEntry.project_id,
      taskId: fullEntry.task_id,
      date: fullEntry.date,
      hours: Number(fullEntry.hours),
      billable: fullEntry.billable,
      hourlyRate: Number(fullEntry.hourly_rate),
      description: fullEntry.description,
      notes: fullEntry.notes,
      status: fullEntry.status || 'draft',
      approved: fullEntry.approved,
      invoiced: fullEntry.invoiced,
      createdAt: fullEntry.created_at,
      value: Number(fullEntry.hours) * Number(fullEntry.hourly_rate),
      user: {
        id: fullEntry.user_id,
        name: fullEntry.user_name,
        email: fullEntry.user_email
      },
      project: fullEntry.project_id ? {
        id: fullEntry.project_id,
        name: fullEntry.project_name,
        clientName: fullEntry.client_name
      } : null,
      task: fullEntry.task_id ? {
        id: fullEntry.task_id,
        title: fullEntry.task_title
      } : null
    }
  }
})
