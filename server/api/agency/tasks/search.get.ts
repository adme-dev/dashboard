/**
 * Cross-Board Task Search
 * GET /api/agency/tasks/search?q=...&excludeTaskId=...&boardId=...&limit=20
 *
 * Searches tasks by title for linking purposes.
 * Only returns top-level tasks (not subtasks).
 */

import { createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const q = ((query.q as string) || '').trim()
  const excludeTaskId = (query.excludeTaskId as string) || ''
  const boardId = (query.boardId as string) || ''
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50)

  if (!q || q.length < 2) {
    return { tasks: [] }
  }

  try {
    // Escape ILIKE wildcards
    const escaped = q.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const params: any[] = [`%${escaped}%`]
    let paramIdx = 2

    let excludeCondition = ''
    if (excludeTaskId) {
      excludeCondition = `AND t.id != $${paramIdx}`
      params.push(excludeTaskId)
      paramIdx++
    }

    let boardCondition = ''
    if (boardId) {
      boardCondition = `AND t.department_id = $${paramIdx}`
      params.push(boardId)
      paramIdx++
    }

    params.push(limit)

    const tasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.department_id as board_id,
        d.name as board_name,
        d.slug as board_slug,
        ts.name as status_name,
        ts.color as status_color
      FROM tasks t
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.title ILIKE $1
        AND t.parent_task_id IS NULL
        ${excludeCondition}
        ${boardCondition}
      ORDER BY t.updated_at DESC
      LIMIT $${paramIdx}
    `, params)

    return {
      tasks: tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        boardId: t.board_id,
        boardName: t.board_name,
        boardSlug: t.board_slug,
        status: t.status_name,
        statusColor: t.status_color,
      })),
    }
  } catch (error: any) {
    console.error('Failed to search tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search tasks: ${error.message}`,
    })
  }
})
