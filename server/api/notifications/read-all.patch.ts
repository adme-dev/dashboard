/**
 * Mark All Notifications as Read
 * PATCH /api/notifications/read-all
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  try {
    const result = await queryOne(`
      UPDATE notifications
      SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING COUNT(*) as marked_count
    `, [user.id])

    // Get actual count since RETURNING with COUNT doesn't work as expected
    const countResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND read_at IS NOT NULL
        AND read_at > NOW() - INTERVAL '1 minute'
    `, [user.id])

    return {
      success: true,
      markedCount: parseInt(countResult?.count || '0')
    }
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to mark all notifications as read'
    })
  }
})
