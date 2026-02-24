/**
 * List all subscribers for a board (admin view)
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const rows = await queryRows(`
    SELECT bs.*,
      tm.name as user_name,
      tm.email as user_email,
      tm.avatar_url as user_avatar,
      t.title as item_title,
      cc.name as column_name
    FROM board_subscriptions bs
    JOIN team_members tm ON bs.user_id = tm.id
    LEFT JOIN tasks t ON bs.item_id = t.id
    LEFT JOIN custom_columns cc ON bs.column_id = cc.id
    WHERE bs.board_id = $1
    ORDER BY tm.name, bs.created_at DESC
  `, [boardId])

  return {
    subscribers: rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      userAvatar: r.user_avatar,
      itemId: r.item_id,
      itemTitle: r.item_title,
      columnId: r.column_id,
      columnName: r.column_name,
      events: r.events,
      notifyInapp: r.notify_inapp,
      notifyEmail: r.notify_email,
      isMuted: r.is_muted,
      createdAt: r.created_at,
    })),
  }
})
