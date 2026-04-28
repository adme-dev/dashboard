/**
 * Subscribe to a board, item, or column (upsert)
 */
import { queryOne } from '~~/server/utils/db'

interface SubscribeBody {
  itemId?: string
  columnId?: string
  events?: string[]
  notifyInapp?: boolean
  notifyEmail?: boolean
  isMuted?: boolean
  snoozeUntil?: string | null
}

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const user = await requireBoardAccess(event, boardId)
  const body = await readBody<SubscribeBody>(event)

  const events = body.events ?? []
  const notifyInapp = body.notifyInapp ?? true
  const notifyEmail = body.notifyEmail ?? false
  const isMuted = body.isMuted ?? false
  const itemId = body.itemId || null
  const columnId = body.columnId || null
  // Explicit null clears snooze; undefined leaves whatever we're inserting (null on insert, current on update).
  const snoozeUntil = body.snoozeUntil ? new Date(body.snoozeUntil) : null

  try {
    const sub = await queryOne(`
      INSERT INTO board_subscriptions (user_id, board_id, item_id, column_id, events, notify_inapp, notify_email, is_muted, snooze_until)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, board_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'), COALESCE(column_id, '00000000-0000-0000-0000-000000000000'))
      DO UPDATE SET
        events = EXCLUDED.events,
        notify_inapp = EXCLUDED.notify_inapp,
        notify_email = EXCLUDED.notify_email,
        is_muted = EXCLUDED.is_muted,
        snooze_until = EXCLUDED.snooze_until,
        updated_at = NOW()
      RETURNING *
    `, [user.id, boardId, itemId, columnId, events, notifyInapp, notifyEmail, isMuted, snoozeUntil])

    return {
      id: sub.id,
      boardId: sub.board_id,
      itemId: sub.item_id,
      columnId: sub.column_id,
      events: sub.events,
      notifyInapp: sub.notify_inapp,
      notifyEmail: sub.notify_email,
      isMuted: sub.is_muted,
      snoozeUntil: sub.snooze_until,
      createdAt: sub.created_at,
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      throw createError({ statusCode: 503, statusMessage: 'Subscriptions are not yet available. Please run database migrations.' })
    }
    throw error
  }
})
