/**
 * Client Portal - Mark Notification Read
 * POST /api/portal/notifications/:id/read
 */

import { execute } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const notificationId = getRouterParam(event, 'id')

  if (!notificationId) {
    throw createError({ statusCode: 400, statusMessage: 'Notification ID is required' })
  }

  try {
    await execute(`
      UPDATE client_notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND client_user_id = $2
    `, [notificationId, clientUser.id])

    return { success: true }
  } catch (error) {
    console.error('Failed to mark notification read:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to mark notification read' })
  }
})
