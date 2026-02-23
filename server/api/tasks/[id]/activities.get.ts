/**
 * Get activity log for a task
 * GET /api/tasks/:id/activities
 */

import { createError, getRouterParam, getQuery } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID required' })
  }

  const limit = Math.min(parseInt(query.limit as string) || 50, 100)

  try {
    const activities = await queryRows(`
      SELECT 
        ta.id,
        ta.activity_type,
        ta.old_value,
        ta.new_value,
        ta.created_at,
        tm.name as user_name,
        tm.avatar_url as user_avatar
      FROM task_activities ta
      LEFT JOIN team_members tm ON ta.user_id = tm.id
      WHERE ta.task_id = $1
        AND ta.activity_type != 'comment'
      ORDER BY ta.created_at DESC
      LIMIT $2
    `, [taskId, limit])

    return { activities }

  } catch (error: any) {
    console.error('Failed to fetch activities:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch activities: ${error.message}`
    })
  }
})
