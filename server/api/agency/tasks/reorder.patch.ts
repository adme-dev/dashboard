/**
 * Reorder tasks (for drag-and-drop between columns or within a column)
 */

import { transaction } from '~~/server/utils/db'

interface ReorderItem {
  id: string
  sortOrder: number
  statusId?: string  // If provided, also update status (for column moves)
}

interface ReorderBody {
  tasks: ReorderItem[]
  userId?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReorderBody>(event)

  if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tasks array is required'
    })
  }

  try {
    await transaction(async (client) => {
      for (const task of body.tasks) {
        if (!task.id) continue

        if (task.statusId) {
          // Update both status and sort order (column move)
          await client.query(`
            UPDATE tasks
            SET status_id = $1, sort_order = $2, updated_at = NOW()
            WHERE id = $3
          `, [task.statusId, task.sortOrder, task.id])
        } else {
          // Update only sort order (within column reorder)
          await client.query(`
            UPDATE tasks
            SET sort_order = $1, updated_at = NOW()
            WHERE id = $2
          `, [task.sortOrder, task.id])
        }
      }
    })

    return {
      success: true,
      message: `Reordered ${body.tasks.length} tasks`,
      updatedCount: body.tasks.length,
    }
  } catch (error: any) {
    console.error('Failed to reorder tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder tasks'
    })
  }
})
