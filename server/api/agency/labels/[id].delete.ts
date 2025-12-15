/**
 * Delete a task label
 */

import { queryOne, queryCount, transaction } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Label ID is required'
    })
  }

  try {
    // Check if label exists
    const label = await queryOne('SELECT id, name FROM task_labels WHERE id = $1', [id])
    if (!label) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Label not found'
      })
    }

    await transaction(async (client) => {
      // Remove label assignments first
      await client.query('DELETE FROM task_label_assignments WHERE label_id = $1', [id])

      // Delete the label
      await client.query('DELETE FROM task_labels WHERE id = $1', [id])
    })

    return { success: true, message: 'Label deleted' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete label:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete label'
    })
  }
})
