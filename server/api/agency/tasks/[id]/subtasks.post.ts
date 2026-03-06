/**
 * Create Subtask
 * POST /api/agency/tasks/:id/subtasks
 *
 * Creates a new task with parent_task_id set to the given task.
 * Inherits department_id and project_id from parent.
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const parentId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!parentId) {
    throw createError({ statusCode: 400, statusMessage: 'Parent task ID required' })
  }

  const { title, assigneeId, dueDate, priority } = body
  if (!title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Subtask title is required' })
  }

  try {
    // Get parent task to inherit department, project, and group
    const parent = await queryOne(
      'SELECT id, department_id, project_id, group_id FROM tasks WHERE id = $1',
      [parentId]
    )
    if (!parent) {
      throw createError({ statusCode: 404, statusMessage: 'Parent task not found' })
    }

    // Get default status for this department
    const defaultStatus = await queryOne(`
      SELECT id FROM task_statuses
      WHERE (department_id IS NULL OR department_id = $1)
        AND is_default = true
      ORDER BY department_id NULLS LAST
      LIMIT 1
    `, [parent.department_id])

    if (!defaultStatus) {
      throw createError({ statusCode: 400, statusMessage: 'No default status found' })
    }

    // Get next sort order among siblings
    const maxOrder = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) as max FROM tasks WHERE parent_task_id = $1',
      [parentId]
    )
    const sortOrder = (maxOrder?.max ?? -1) + 1

    const subtask = await queryOne(`
      INSERT INTO tasks (
        department_id, project_id, parent_task_id, group_id,
        status_id, title, priority, assignee_id, due_date,
        reporter_id, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        title,
        description,
        priority,
        due_date as "dueDate",
        sort_order as "sortOrder",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      parent.department_id,
      parent.project_id || null,
      parentId,
      parent.group_id || null,
      defaultStatus.id,
      title.trim(),
      priority || 'medium',
      assigneeId || null,
      dueDate || null,
      user.id,
      sortOrder,
    ])

    // Fetch full subtask with status info
    const full = await queryOne(`
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
      WHERE t.id = $1
    `, [subtask.id])

    return { subtask: full }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create subtask:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create subtask: ${error.message}`,
    })
  }
})
