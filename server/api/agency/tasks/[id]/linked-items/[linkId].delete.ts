/**
 * Delete Linked Item
 * DELETE /api/agency/tasks/:id/linked-items/:linkId
 *
 * Removes a link. Verifies the link belongs to the requesting task (either direction).
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const linkId = getRouterParam(event, 'linkId')

  if (!taskId || !linkId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID and link ID are required' })
  }

  try {
    // Verify the link exists and belongs to this task (either direction)
    const link = await queryOne(`
      SELECT id FROM task_linked_items
      WHERE id = $1 AND (task_id = $2 OR linked_task_id = $2)
    `, [linkId, taskId])

    if (!link) {
      throw createError({ statusCode: 404, statusMessage: 'Linked item not found' })
    }

    await execute('DELETE FROM task_linked_items WHERE id = $1', [linkId])

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete linked item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete linked item: ${error.message}`,
    })
  }
})
