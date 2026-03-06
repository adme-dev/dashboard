/**
 * Duplicate a task — creates a copy with "(Copy)" appended to the title.
 * Copies core fields only (no subtasks, linked items, or column values).
 */

import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })
  }

  const source = await queryOne('SELECT * FROM tasks WHERE id = $1', [id])
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }

  const newTitle = `${source.title} (Copy)`

  const created = await queryOne(`
    INSERT INTO tasks (
      department_id, project_id, group_id, status_id,
      title, description, priority, task_type,
      assignee_id, reporter_id, due_date, start_date, estimated_hours
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, title
  `, [
    source.department_id,
    source.project_id,
    source.group_id,
    source.status_id,
    newTitle,
    source.description,
    source.priority,
    source.task_type,
    source.assignee_id,
    source.reporter_id,
    source.due_date,
    source.start_date,
    source.estimated_hours,
  ])

  return { id: created.id, title: created.title }
})
