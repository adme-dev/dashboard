/**
 * Get all workspaces with their boards
 * GET /api/agency/workspaces
 */

import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'
import { workspaceCache } from '../../../utils/cache'

export default eventHandler(async (event) => {
  await requireAuth(event)

  // Check cache first
  const cached = workspaceCache.get('workspaces:list')
  if (cached) {
    return cached
  }

  try {
    // Single query: get boards with task counts, grouped by workspace in JS
    const boards = await queryRows(`
      SELECT
        w.id as workspace_id,
        w.name as workspace_name,
        w.slug as workspace_slug,
        w.color as workspace_color,
        w.icon as workspace_icon,
        w.description as workspace_description,
        w.sort_order as workspace_sort_order,
        d.id as board_id,
        d.name as board_name,
        d.slug as board_slug,
        d.color as board_color,
        d.description as board_description,
        d.sort_order as board_sort_order,
        COUNT(t.id) as task_count
      FROM workspaces w
      LEFT JOIN departments d ON d.workspace_id = w.id AND d.is_active = true
      LEFT JOIN tasks t ON t.department_id = d.id
      WHERE w.is_active = true
      GROUP BY w.id, w.name, w.slug, w.color, w.icon, w.description, w.sort_order,
               d.id, d.name, d.slug, d.color, d.description, d.sort_order
      ORDER BY w.sort_order, w.name, d.sort_order, d.name
    `)

    // Group by workspace in JS
    const workspaceMap = new Map<string, any>()

    for (const row of boards) {
      if (!workspaceMap.has(row.workspace_id)) {
        workspaceMap.set(row.workspace_id, {
          id: row.workspace_id,
          name: row.workspace_name,
          slug: row.workspace_slug,
          color: row.workspace_color,
          icon: row.workspace_icon,
          description: row.workspace_description,
          sortOrder: row.workspace_sort_order,
          stats: { boards: 0, tasks: 0 },
          boards: []
        })
      }

      const ws = workspaceMap.get(row.workspace_id)
      if (row.board_id) {
        const taskCount = parseInt(row.task_count)
        ws.boards.push({
          id: row.board_id,
          name: row.board_name,
          slug: row.board_slug,
          color: row.board_color,
          description: row.board_description,
          taskCount
        })
        ws.stats.boards++
        ws.stats.tasks += taskCount
      }
    }

    const result = {
      workspaces: Array.from(workspaceMap.values())
    }
    
    // Cache for 5 minutes
    workspaceCache.set('workspaces:list', result)

    return result

  } catch (error: any) {
    console.error('Failed to fetch workspaces:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch workspaces: ${error.message}`
    })
  }
})
