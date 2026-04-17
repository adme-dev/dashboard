/**
 * List tasks with filtering and pagination
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)

  // Build dynamic query with filters
  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (query.departmentId) {
    conditions.push(`t.department_id = $${idx}`)
    params.push(query.departmentId)
    idx++
  }

  if (query.workspaceId) {
    conditions.push(`t.department_id IN (SELECT id FROM departments WHERE workspace_id = $${idx})`)
    params.push(query.workspaceId)
    idx++
  }

  if (query.projectId) {
    conditions.push(`t.project_id = $${idx}`)
    params.push(query.projectId)
    idx++
  }

  if (query.statusId) {
    conditions.push(`t.status_id = $${idx}`)
    params.push(query.statusId)
    idx++
  }

  if (query.assigneeId) {
    conditions.push(`t.assignee_id = $${idx}`)
    params.push(query.assigneeId)
    idx++
  }

  if (query.reporterId) {
    conditions.push(`t.reporter_id = $${idx}`)
    params.push(query.reporterId)
    idx++
  }

  if (query.priority) {
    conditions.push(`t.priority = $${idx}`)
    params.push(query.priority)
    idx++
  }

  if (query.dueDateFrom) {
    conditions.push(`t.due_date >= $${idx}`)
    params.push(query.dueDateFrom)
    idx++
  }

  if (query.dueDateTo) {
    conditions.push(`t.due_date <= $${idx}`)
    params.push(query.dueDateTo)
    idx++
  }

  if (query.search) {
    conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`)
    params.push(`%${query.search}%`)
    idx++
  }

  if (query.isBlocked === 'true') {
    conditions.push('t.is_blocked = true')
  } else if (query.isBlocked === 'false') {
    conditions.push('t.is_blocked = false')
  }

  if (query.excludeCompleted === 'true') {
    conditions.push('t.status_is_final = false')
  }

  if (query.overdue === 'true') {
    conditions.push('t.due_date < CURRENT_DATE AND t.status_is_final = false')
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    // Get tasks with related data. COUNT(*) OVER() returns the full unpaginated
    // row count in the same query — avoids a second scan of tasks+task_statuses.
    const tasks = await queryRows(`
      SELECT
        COUNT(*) OVER() as total_count,
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        t.status_is_final as status_is_final,
        d.name as department_name,
        d.color as department_color,
        p.name as project_name,
        assignee.name as assignee_name,
        assignee.email as assignee_email,
        reporter.name as reporter_name,
        COALESCE(label_agg.labels, '[]'::json) as labels,
        COALESCE(sub.subtask_count, 0) as subtask_count,
        COALESCE(sub.completed_subtasks, 0) as completed_subtasks,
        COALESCE(comments.comment_count, 0) as comment_count
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      LEFT JOIN team_members reporter ON t.reporter_id = reporter.id
      LEFT JOIN (
        SELECT
          tla.task_id,
          json_agg(json_build_object(
            'id', tl.id,
            'name', tl.name,
            'color', tl.color
          )) as labels
        FROM task_label_assignments tla
        JOIN task_labels tl ON tla.label_id = tl.id
        GROUP BY tla.task_id
      ) label_agg ON t.id = label_agg.task_id
      LEFT JOIN (
        SELECT
          parent_task_id,
          COUNT(*) as subtask_count,
          COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_subtasks
        FROM tasks
        WHERE parent_task_id IS NOT NULL
        GROUP BY parent_task_id
      ) sub ON t.id = sub.parent_task_id
      LEFT JOIN (
        SELECT task_id, COUNT(*) as comment_count
        FROM task_activities
        WHERE activity_type = 'comment'
        GROUP BY task_id
      ) comments ON t.id = comments.task_id
      ${whereClause}
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        ts.sort_order,
        t.sort_order,
        t.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset])

    return {
      tasks: tasks.map(t => ({
        id: t.id,
        projectId: t.project_id,
        departmentId: t.department_id,
        parentTaskId: t.parent_task_id,
        statusId: t.status_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        taskType: t.task_type,
        assigneeId: t.assignee_id,
        reporterId: t.reporter_id,
        dueDate: t.due_date,
        startDate: t.start_date,
        estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
        actualHours: t.actual_hours ? Number(t.actual_hours) : null,
        sortOrder: t.sort_order,
        isBlocked: t.is_blocked,
        blockedReason: t.blocked_reason,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        // Related data
        status: {
          id: t.status_id,
          name: t.status_name,
          color: t.status_color,
          category: t.status_category,
          isFinal: t.status_is_final,
        },
        department: {
          id: t.department_id,
          name: t.department_name,
          color: t.department_color,
        },
        project: t.project_id ? {
          id: t.project_id,
          name: t.project_name,
        } : null,
        assignee: t.assignee_id ? {
          id: t.assignee_id,
          name: t.assignee_name,
          email: t.assignee_email,
        } : null,
        reporter: t.reporter_id ? {
          id: t.reporter_id,
          name: t.reporter_name,
        } : null,
        labels: t.labels,
        subtaskCount: Number(t.subtask_count) || 0,
        completedSubtasks: Number(t.completed_subtasks) || 0,
        commentCount: Number(t.comment_count) || 0,
      })),
      pagination: {
        total: Number(tasks[0]?.total_count) || 0,
        limit,
        offset,
        hasMore: offset + tasks.length < Number(tasks[0]?.total_count),
      }
    }
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch tasks'
    })
  }
})
