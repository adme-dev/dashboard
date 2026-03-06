/**
 * Get all tasks for a project, grouped by board (department).
 * Returns top-level tasks only (no subtasks).
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const tasks = await queryRows(`
    SELECT
      t.id, t.title, t.priority,
      t.due_date as "dueDate",
      t.completed_at as "completedAt",
      ts.name as "statusName", ts.color as "statusColor", ts.category as "statusCategory",
      d.id as "boardId", d.name as "boardName", d.slug as "boardSlug",
      tm.id as "assigneeId", tm.name as "assigneeName", tm.avatar_url as "assigneeAvatar",
      (SELECT COUNT(*)::int FROM tasks st WHERE st.parent_task_id = t.id) as "subtaskCount",
      (SELECT COUNT(*)::int FROM tasks st WHERE st.parent_task_id = t.id AND st.completed_at IS NOT NULL) as "completedSubtaskCount"
    FROM tasks t
    JOIN task_statuses ts ON t.status_id = ts.id
    JOIN departments d ON t.department_id = d.id
    LEFT JOIN team_members tm ON t.assignee_id = tm.id
    WHERE t.project_id = $1 AND t.parent_task_id IS NULL
    ORDER BY d.name, t.sort_order, t.created_at DESC
  `, [projectId])

  // Group by board
  const byBoard: Record<string, { boardName: string; boardSlug: string; tasks: typeof tasks }> = {}
  for (const task of tasks) {
    const bid = task.boardId as string
    if (!byBoard[bid]) {
      byBoard[bid] = {
        boardName: task.boardName as string,
        boardSlug: task.boardSlug as string,
        tasks: [],
      }
    }
    byBoard[bid].tasks.push(task)
  }

  return { tasks, byBoard }
})
