/**
 * Get active timer for current user
 * GET /api/agency/time/timer
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const timer = await queryOne(`
    SELECT
      at.*,
      p.name AS project_name,
      c.name AS client_name,
      t.title AS task_title
    FROM active_timers at
    LEFT JOIN projects p ON at.project_id = p.id
    LEFT JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON at.task_id = t.id
    WHERE at.user_id = $1
  `, [user.id])

  if (!timer) {
    return { timer: null }
  }

  // Calculate elapsed time
  const startedAt = new Date(timer.started_at)
  const now = new Date()
  const elapsedMs = now.getTime() - startedAt.getTime()
  const elapsedHours = elapsedMs / (1000 * 60 * 60)

  return {
    timer: {
      id: timer.id,
      userId: timer.user_id,
      projectId: timer.project_id,
      taskId: timer.task_id,
      description: timer.description,
      billable: timer.billable,
      startedAt: timer.started_at,
      elapsedHours: Math.round(elapsedHours * 100) / 100,
      elapsedMinutes: Math.floor(elapsedMs / (1000 * 60)),
      project: timer.project_id ? {
        id: timer.project_id,
        name: timer.project_name,
        clientName: timer.client_name
      } : null,
      task: timer.task_id ? {
        id: timer.task_id,
        title: timer.task_title
      } : null
    }
  }
})
