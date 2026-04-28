/**
 * Get current user's subscriptions for a board
 */
import { queryRows } from '~~/server/utils/db'
import { setCacheHeaders } from '~~/server/utils/cacheHeaders'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const user = await requireBoardAccess(event, boardId)

  setCacheHeaders(event, 120, 300)

  try {
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
        snoozeUntil: s.snooze_until,
        createdAt: s.created_at,
      })),
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return { subscriptions: [] }
    }
    throw error
  }
})
