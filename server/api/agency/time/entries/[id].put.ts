/**
 * Update a time entry
 * PUT /api/agency/time/entries/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const entryId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!entryId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entry ID is required'
    })
  }

  // Get existing entry
  const existing = await queryOne(
    'SELECT * FROM time_entries WHERE id = $1',
    [entryId]
  )

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Time entry not found'
    })
  }

  // Check permissions (user can edit own entries, managers can edit any)
  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')
  const isOwner = existing.user_id === user.id

  if (!isOwner && !isManager) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to edit this entry'
    })
  }

  // Cannot edit approved/invoiced entries unless manager
  if ((existing.approved || existing.invoiced) && !isManager) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot edit approved or invoiced time entries'
    })
  }

  // Validate hours
  if (body.hours !== undefined) {
    if (body.hours <= 0) {
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
  }

  // Update the entry
  const updated = await queryOne(`
    UPDATE time_entries SET
      project_id = COALESCE($1, project_id),
      task_id = COALESCE($2, task_id),
      date = COALESCE($3, date),
      hours = COALESCE($4, hours),
      billable = COALESCE($5, billable),
      hourly_rate = COALESCE($6, hourly_rate),
      description = COALESCE($7, description),
      notes = COALESCE($8, notes)
    WHERE id = $9
    RETURNING *
  `, [
    body.projectId || body.project_id,
    body.taskId || body.task_id,
    body.date,
    body.hours,
    body.billable,
    body.hourlyRate || body.hourly_rate,
    body.description,
    body.notes,
    entryId
  ])

  // Fetch related data
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
  `, [entryId])

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
