/**
 * Create a new task
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { notifyTaskAssigned } from '~~/server/utils/notifications'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

interface CreateTaskBody {
  departmentId: string
  title: string
  description?: string
  projectId?: string
  parentTaskId?: string
  groupId?: string
  statusId?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  taskType?: string
  assigneeId?: string
  reporterId?: string
  dueDate?: string
  startDate?: string
  estimatedHours?: number
  labels?: string[]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateTaskBody>(event)

  if (!body.departmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  if (!body.title?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task title is required'
    })
  }

  try {
    // Resolve slug to UUID if needed
    let departmentId = body.departmentId
    if (!isUUID(departmentId)) {
      const dept = await queryOne('SELECT id FROM departments WHERE slug = $1', [departmentId])
      if (!dept) {
        throw createError({ statusCode: 404, statusMessage: 'Department not found' })
      }
      departmentId = dept.id
    }

    // Get default status if not provided
    let statusId = body.statusId
    if (!statusId) {
      const defaultStatus = await queryOne(`
        SELECT id FROM task_statuses
        WHERE (department_id IS NULL OR department_id = $1)
          AND is_default = true
        ORDER BY department_id NULLS LAST
        LIMIT 1
      `, [departmentId])
      statusId = defaultStatus?.id
    }

    if (!statusId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No valid status found for this department'
      })
    }

    const result = await transaction(async (client) => {
      // Create the task
      const taskResult = await client.query(`
        INSERT INTO tasks (
          department_id, project_id, parent_task_id, group_id, status_id,
          title, description, priority, task_type,
          assignee_id, reporter_id, due_date, start_date, estimated_hours
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        departmentId,
        body.projectId || null,
        body.parentTaskId || null,
        body.groupId || null,
        statusId,
        body.title.trim(),
        body.description?.trim() || null,
        body.priority || 'medium',
        body.taskType || 'task',
        body.assigneeId || null,
        body.reporterId || null,
        body.dueDate || null,
        body.startDate || null,
        body.estimatedHours || null,
      ])

      const task = taskResult.rows[0]

      // Add labels if provided
      if (body.labels && body.labels.length > 0) {
        for (const labelId of body.labels) {
          await client.query(`
            INSERT INTO task_label_assignments (task_id, label_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [task.id, labelId])
        }
      }

      // Log creation activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'created', $3)
      `, [
        task.id,
        body.reporterId || null,
        `Created task "${task.title}"`,
      ])

      return task
    })

    // Fetch complete task with relations
    const task = await queryOne(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        d.name as department_name,
        assignee.name as assignee_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.id = $1
    `, [result.id])

    // Get labels
    const labels = await queryRows(`
      SELECT tl.id, tl.name, tl.color
      FROM task_label_assignments tla
      JOIN task_labels tl ON tla.label_id = tl.id
      WHERE tla.task_id = $1
    `, [result.id])

    // Send notification if task is assigned to someone
    if (task.assignee_id && task.assignee_id !== body.reporterId) {
      notifyTaskAssigned({
        assigneeId: task.assignee_id,
        taskId: task.id,
        taskTitle: task.title,
        assignerId: body.reporterId || '',
        dueDate: task.due_date
      }).catch(err => console.error('Failed to send task assignment notification:', err))
    }

    return {
      id: task.id,
      projectId: task.project_id,
      departmentId: task.department_id,
      parentTaskId: task.parent_task_id,
      statusId: task.status_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      taskType: task.task_type,
      assigneeId: task.assignee_id,
      reporterId: task.reporter_id,
      dueDate: task.due_date,
      startDate: task.start_date,
      estimatedHours: task.estimated_hours ? Number(task.estimated_hours) : null,
      sortOrder: task.sort_order,
      isBlocked: task.is_blocked,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      status: {
        id: task.status_id,
        name: task.status_name,
        color: task.status_color,
      },
      department: {
        id: task.department_id,
        name: task.department_name,
      },
      assignee: task.assignee_id ? {
        id: task.assignee_id,
        name: task.assignee_name,
      } : null,
      labels,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create task:', error.message, { departmentId: body.departmentId, title: body.title, groupId: body.groupId })
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create task: ${error.message}`
    })
  }
})
