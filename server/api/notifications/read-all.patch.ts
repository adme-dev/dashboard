/**
 * Mark All Notifications as Read
 * PATCH /api/notifications/read-all
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  try {
    // Count unread first, then update — PostgreSQL doesn't support COUNT() in RETURNING
    const countResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `, [user.id])

    const markedCount = parseInt(countResult?.count || '0')

    if (markedCount > 0) {
      await execute(`
        UPDATE notifications
        SET is_read = true, read_at = NOW()
        WHERE user_id = $1 AND is_read = false
      `, [user.id])
    }

    return {
      success: true,
      markedCount
    }
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to mark all notifications as read'
    })
  }
})
