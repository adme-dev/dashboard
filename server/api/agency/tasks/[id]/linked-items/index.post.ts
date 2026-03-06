/**
 * Create Linked Item
 * POST /api/agency/tasks/:id/linked-items
 *
 * Body: { linkedTaskId, linkType?, columnId? }
 * Checks both directions for existing link before inserting.
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })
  }

  const { linkedTaskId, linkType, columnId } = body

  if (!linkedTaskId) {
    throw createError({ statusCode: 400, statusMessage: 'Linked task ID is required' })
  }

  if (taskId === linkedTaskId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot link a task to itself' })
  }

  const validLinkTypes = ['related', 'duplicate', 'blocks', 'is_blocked_by']
  const resolvedLinkType = validLinkTypes.includes(linkType) ? linkType : 'related'

  try {
    // Verify both tasks exist
    const sourceTask = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!sourceTask) {
      throw createError({ statusCode: 404, statusMessage: 'Source task not found' })
    }

    const targetTask = await queryOne('SELECT id FROM tasks WHERE id = $1', [linkedTaskId])
    if (!targetTask) {
      throw createError({ statusCode: 404, statusMessage: 'Target task not found' })
    }

    // Check both directions for existing link
    const existing = await queryOne(`
      SELECT id FROM task_linked_items
      WHERE (task_id = $1 AND linked_task_id = $2)
         OR (task_id = $2 AND linked_task_id = $1)
    `, [taskId, linkedTaskId])

    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'These tasks are already linked' })
    }

    // Insert the link
    const link = await queryOne(`
      INSERT INTO task_linked_items (task_id, linked_task_id, link_type, column_id, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, task_id, linked_task_id, link_type, column_id, created_at
    `, [taskId, linkedTaskId, resolvedLinkType, columnId || null, user.id])

    // Fetch the linked task details for the response
    const linkedTask = await queryOne(`
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
      WHERE t.id = $1
    `, [linkedTaskId])

    return {
      linkedItem: {
        id: link.id,
        linkType: link.link_type,
        columnId: link.column_id,
        task: {
          id: linkedTask.id,
          title: linkedTask.title,
          boardId: linkedTask.board_id,
          boardName: linkedTask.board_name,
          boardSlug: linkedTask.board_slug,
          status: linkedTask.status_name,
          statusColor: linkedTask.status_color,
        },
        createdAt: link.created_at,
      },
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create linked item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create linked item: ${error.message}`,
    })
  }
})
