/**
 * Delete Notification
 * DELETE /api/notifications/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const notificationId = getRouterParam(event, 'id')

  if (!notificationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Notification ID is required'
    })
  }

  try {
    // Delete only if owned by user
    const deleted = await queryOne(`
      DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [notificationId, user.id])

    if (!deleted) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Notification not found'
      })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to delete notification:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete notification'
    })
  }
})
