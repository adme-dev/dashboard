/**
 * Start a timer
 * POST /api/agency/time/timer/start
 */

import { queryOne, queryCount } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  // Check if user already has an active timer
  const existingTimer = await queryOne(
    'SELECT id FROM active_timers WHERE user_id = $1',
    [user.id]
  )

  if (existingTimer) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You already have an active timer. Stop it first before starting a new one.'
    })
  }

  // Create the timer
  const timer = await queryOne(`
    INSERT INTO active_timers (
      user_id,
      project_id,
      task_id,
      description,
      billable,
      started_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING *
  `, [
    user.id,
    body.projectId || body.project_id || null,
    body.taskId || body.task_id || null,
    body.description || null,
    body.billable !== undefined ? body.billable : true
  ])

  // Fetch related data
  const fullTimer = await queryOne(`
    SELECT
      at.*,
      p.name AS project_name,
      c.name AS client_name,
      t.title AS task_title
    FROM active_timers at
    LEFT JOIN projects p ON at.project_id = p.id
    LEFT JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON at.task_id = t.id
    WHERE at.id = $1
  `, [timer.id])

  return {
    timer: {
      id: fullTimer.id,
      userId: fullTimer.user_id,
      projectId: fullTimer.project_id,
      taskId: fullTimer.task_id,
      description: fullTimer.description,
      billable: fullTimer.billable,
      startedAt: fullTimer.started_at,
      elapsedHours: 0,
      elapsedMinutes: 0,
      project: fullTimer.project_id ? {
        id: fullTimer.project_id,
        name: fullTimer.project_name,
        clientName: fullTimer.client_name
      } : null,
      task: fullTimer.task_id ? {
        id: fullTimer.task_id,
        title: fullTimer.task_title
      } : null
    }
  }
})
