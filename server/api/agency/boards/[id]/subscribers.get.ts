/**
 * List subscribers for a board.
 * - default: full subscriber rows (admin view)
 * - ?summary=true: { count, top: [..3] } — used by Watch popover stack
 */
import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  await requireBoardAccess(event, boardId)

  const summary = query.summary === 'true' || query.summary === '1'

  try {
    if (summary) {
      const top = await queryRows(`
        SELECT DISTINCT ON (tm.id)
          tm.id, tm.name, tm.avatar_url
        FROM board_subscriptions bs
        JOIN team_members tm ON bs.user_id = tm.id
        WHERE bs.board_id = $1 AND bs.is_muted = false
        ORDER BY tm.id, bs.created_at ASC
        LIMIT 3
      `, [boardId])

      const countRow = await queryOne(`
        SELECT COUNT(DISTINCT bs.user_id) AS count
        FROM board_subscriptions bs
        WHERE bs.board_id = $1 AND bs.is_muted = false
      `, [boardId])

      return {
        count: parseInt(countRow?.count || '0', 10),
        top: top.map(r => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url })),
      }
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
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return summary ? { count: 0, top: [] } : { subscribers: [] }
    }
    throw error
  }
})
