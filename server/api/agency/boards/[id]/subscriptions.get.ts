/**
 * Get current user's subscriptions for a board
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const subs = await queryRows(`
    SELECT bs.*,
      t.title as item_title,
      cc.name as column_name
    FROM board_subscriptions bs
    LEFT JOIN tasks t ON bs.item_id = t.id
    LEFT JOIN custom_columns cc ON bs.column_id = cc.id
    WHERE bs.user_id = $1 AND bs.board_id = $2
    ORDER BY bs.created_at DESC
  `, [user.id, boardId])

  return {
    subscriptions: subs.map(s => ({
      id: s.id,
      boardId: s.board_id,
      itemId: s.item_id,
      itemTitle: s.item_title,
      columnId: s.column_id,
      columnName: s.column_name,
      events: s.events,
      notifyInapp: s.notify_inapp,
      notifyEmail: s.notify_email,
      isMuted: s.is_muted,
      createdAt: s.created_at,
    })),
  }
})
