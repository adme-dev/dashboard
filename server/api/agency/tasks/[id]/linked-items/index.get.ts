/**
 * Get Linked Items for a Task
 * GET /api/agency/tasks/:id/linked-items
 *
 * Returns all linked items in both directions (task_id or linked_task_id).
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })
  }

  try {
    // Query both directions and determine the "other" task
    const rows = await queryRows(`
      SELECT
        tli.id,
        tli.task_id,
        tli.linked_task_id,
        tli.link_type,
        tli.column_id,
        tli.created_at,
        -- "other" task details (forward direction: linked_task is other)
        CASE WHEN tli.task_id = $1 THEN tli.linked_task_id ELSE tli.task_id END as other_task_id,
        ot.title as other_title,
        ot.department_id as other_board_id,
        d.name as other_board_name,
        d.slug as other_board_slug,
        ts.name as other_status,
        ts.color as other_status_color,
        -- Creator details
        tm.name as created_by_name
      FROM task_linked_items tli
      JOIN tasks ot ON ot.id = CASE WHEN tli.task_id = $1 THEN tli.linked_task_id ELSE tli.task_id END
      LEFT JOIN departments d ON ot.department_id = d.id
      LEFT JOIN task_statuses ts ON ot.status_id = ts.id
      LEFT JOIN team_members tm ON tli.created_by = tm.id
      WHERE tli.task_id = $1 OR tli.linked_task_id = $1
    `, [taskId])

    const linkedItems = rows.map((r: any) => {
      // If this task is the linked_task_id side, invert certain directional link types
      let linkType = r.link_type
      if (r.linked_task_id === taskId) {
        if (linkType === 'blocks') linkType = 'is_blocked_by'
        else if (linkType === 'is_blocked_by') linkType = 'blocks'
      }

      return {
        id: r.id,
        linkType,
        columnId: r.column_id,
        task: {
          id: r.other_task_id,
          title: r.other_title,
          boardId: r.other_board_id,
          boardName: r.other_board_name,
          boardSlug: r.other_board_slug,
          status: r.other_status,
          statusColor: r.other_status_color,
        },
        createdByName: r.created_by_name,
        createdAt: r.created_at,
      }
    })

    return { linkedItems }
  } catch (error: any) {
    console.error('Failed to fetch linked items:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch linked items: ${error.message}`,
    })
  }
})
