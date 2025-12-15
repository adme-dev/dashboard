/**
 * List User Notifications
 * GET /api/notifications
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const unreadOnly = query.unread === 'true'
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0

  try {
    let whereClause = 'n.user_id = $1'
    const params: any[] = [user.id]
    let paramIdx = 2

    if (unreadOnly) {
      whereClause += ' AND n.read_at IS NULL'
    }

    const notifications = await queryRows(`
      SELECT
        n.id,
        n.type,
        n.title,
        n.message,
        n.link,
        n.metadata,
        n.read_at,
        n.created_at,
        tm.id as actor_id,
        tm.name as actor_name,
        tm.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN team_members tm ON n.actor_id = tm.id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, limit, offset])

    // Get unread count
    const countResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND read_at IS NULL
    `, [user.id])

    return {
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        metadata: n.metadata,
        isRead: !!n.read_at,
        readAt: n.read_at,
        createdAt: n.created_at,
        actor: n.actor_id ? {
          id: n.actor_id,
          name: n.actor_name,
          avatarUrl: n.actor_avatar
        } : null
      })),
      unreadCount: parseInt(countResult?.count || '0'),
      hasMore: notifications.length === limit
    }
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch notifications'
    })
  }
})
