/**
 * Bulk Delete Tasks
 * DELETE /api/agency/tasks/bulk
 *
 * Delete multiple tasks at once
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { taskIds } = body

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'taskIds must be a non-empty array'
    })
  }

  // Limit bulk delete to prevent accidents
  if (taskIds.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete more than 100 tasks at once'
    })
  }

  try {
    const taskIdPlaceholders = taskIds.map((_, i) => `$${i + 1}`).join(', ')

    const result = await queryRows(`
      DELETE FROM tasks
      WHERE id IN (${taskIdPlaceholders})
      RETURNING id
    `, taskIds)

    return {
      success: true,
      deletedCount: result.length,
      deletedIds: result.map(r => r.id)
    }
  } catch (error: any) {
    console.error('Failed to bulk delete tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to bulk delete tasks'
    })
  }
})
