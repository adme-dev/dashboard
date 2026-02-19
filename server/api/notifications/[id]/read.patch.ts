/**
 * Mark Notification as Read
 * PATCH /api/notifications/:id/read
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
    // Mark as read (only if owned by user)
    const notification = await queryOne(`
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND is_read = false
      RETURNING id, read_at
    `, [notificationId, user.id])

    if (!notification) {
      // Check if notification exists but belongs to another user
      const exists = await queryOne(`
        SELECT id FROM notifications WHERE id = $1
      `, [notificationId])

      if (!exists) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Notification not found'
        })
      }

      // Either already read or belongs to another user
      return { success: true, alreadyRead: true }
    }

    return {
      success: true,
      readAt: notification.read_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to mark notification as read:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to mark notification as read'
    })
  }
})
