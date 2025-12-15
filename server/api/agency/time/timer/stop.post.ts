/**
 * Stop the active timer and create a time entry
 * POST /api/agency/time/timer/stop
 */

import { queryOne, queryCount } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Get the active timer
  const timer = await queryOne(
    'SELECT * FROM active_timers WHERE user_id = $1',
    [user.id]
  )

  if (!timer) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No active timer found'
    })
  }

  // Calculate elapsed time
  const startedAt = new Date(timer.started_at)
  const now = new Date()
  const elapsedMs = now.getTime() - startedAt.getTime()
  let elapsedHours = elapsedMs / (1000 * 60 * 60)

  // Round to nearest 0.25 (15 minutes) or use custom rounding
  const roundTo = body.roundTo || 0.25
  elapsedHours = Math.ceil(elapsedHours / roundTo) * roundTo

  // Minimum 0.25 hours (15 minutes)
  if (elapsedHours < 0.25) {
    elapsedHours = 0.25
  }

  // Get hourly rate
  let hourlyRate = body.hourlyRate || body.hourly_rate

  if (!hourlyRate) {
    // Try to get user's default rate
    const teamMember = await queryOne(
      'SELECT default_hourly_rate FROM team_members WHERE id = $1',
      [user.id]
    )
    hourlyRate = teamMember?.default_hourly_rate

    // If still no rate and project exists, try project's client rate
    if (!hourlyRate && timer.project_id) {
      const project = await queryOne(`
        SELECT c.hourly_rate
        FROM projects p
        JOIN agency_clients c ON p.client_id = c.id
        WHERE p.id = $1
      `, [timer.project_id])
      hourlyRate = project?.hourly_rate
    }
  }

  if (!hourlyRate) {
    hourlyRate = 0
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
    RETURNING *
  `, [
    user.id,
    timer.project_id,
    timer.task_id,
    now.toISOString().split('T')[0], // Today's date
    elapsedHours,
    timer.billable,
    hourlyRate,
    body.description || timer.description,
    body.notes || null
  ])

  // Delete the timer
  await queryCount(
    'DELETE FROM active_timers WHERE id = $1',
    [timer.id]
  )

  // Fetch full entry data
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
    },
    timerStopped: true,
    elapsedMinutes: Math.floor(elapsedMs / (1000 * 60)),
    recordedHours: elapsedHours
  }
})
