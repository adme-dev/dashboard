/**
 * Mark Notification as Read
 * POST /api/agency/client-portal/notifications/:id/read
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const notificationId = getRouterParam(event, 'id')

  if (!notificationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Notification ID is required'
    })
  }

  try {
    // Handle "all" to mark all as read
    if (notificationId === 'all') {
      const body = await readBody(event)
      const clientUserId = body.clientUserId

      if (!clientUserId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Client user ID is required'
        })
      }

      await queryOne(`
        UPDATE client_notifications
        SET is_read = true, read_at = NOW()
        WHERE client_user_id = $1 AND is_read = false
      `, [clientUserId])

      return {
        success: true,
        message: 'All notifications marked as read'
      }
    }

    // Mark single notification as read
    const notification = await queryOne(`
      UPDATE client_notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1
      RETURNING id, is_read, read_at
    `, [notificationId])

    if (!notification) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Notification not found'
      })
    }

    return {
      success: true,
      notification: {
        id: notification.id,
        isRead: notification.is_read,
        readAt: notification.read_at
      }
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
