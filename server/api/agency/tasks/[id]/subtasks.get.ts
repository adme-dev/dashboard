/**
 * List Subtasks for a Task
 * GET /api/agency/tasks/:id/subtasks
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID required' })
  }

  try {
    const subtasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.due_date as "dueDate",
        t.completed_at as "completedAt",
        t.sort_order as "sortOrder",
        ts.name as "statusName",
        ts.color as "statusColor",
        ts.category as "statusCategory",
        tm.id as "assigneeId",
        tm.name as "assigneeName",
        tm.avatar_url as "assigneeAvatar",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt"
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      WHERE t.parent_task_id = $1
      ORDER BY t.sort_order, t.created_at
    `, [taskId])

    return { subtasks }
  } catch (error: any) {
    console.error('Failed to fetch subtasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch subtasks: ${error.message}`,
    })
  }
})
