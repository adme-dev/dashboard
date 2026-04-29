/**
 * Aggregated subscription list for the current user.
 * Returns every board/item/column subscription the user has, with board name
 * and item/column titles joined, plus a server-computed preset and scope.
 *
 * Powers the My Subscriptions page at /agency/notifications/watching.
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

type Preset = 'all' | 'mentions' | 'custom' | 'muted'

function classifyPreset(events: string[] | null, isMuted: boolean): Preset {
  if (isMuted) return 'muted'
  const e = events || []
  if (e.length === 0) return 'all'
  if (e.length === 1 && e[0] === 'task_mentioned') return 'mentions'
  return 'custom'
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  // Pagination — bounded so a runaway page size can't DOS the DB.
  const requestedLimit = Number(query.limit ?? DEFAULT_LIMIT)
  const limit = Math.max(1, Math.min(MAX_LIMIT, isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT))
  const requestedOffset = Number(query.offset ?? 0)
  const offset = Math.max(0, isFinite(requestedOffset) ? requestedOffset : 0)

  try {
    const rows = await queryRows(`
      SELECT
        bs.id,
        bs.board_id,
        d.name AS board_name,
        bs.item_id,
        t.title AS item_title,
        bs.column_id,
        cc.name AS column_name,
        bs.events,
        bs.notify_inapp,
        bs.notify_email,
        bs.is_muted,
        bs.snooze_until,
        bs.created_at,
        bs.updated_at
      FROM board_subscriptions bs
      JOIN departments d ON bs.board_id = d.id
      LEFT JOIN tasks t ON bs.item_id = t.id
      LEFT JOIN custom_columns cc ON bs.column_id = cc.id
      WHERE bs.user_id = $1
      ORDER BY d.name, bs.created_at DESC
      LIMIT $2 OFFSET $3
    `, [user.id, limit, offset])

    const totalRow = await queryOne(
      `SELECT COUNT(*)::int AS count FROM board_subscriptions WHERE user_id = $1`,
      [user.id]
    )
    const total = totalRow?.count || 0

    return {
      subscriptions: rows.map(r => {
        const scope: 'board' | 'item' | 'column' =
          r.column_id ? 'column' : r.item_id ? 'item' : 'board'
        return {
          id: r.id,
          boardId: r.board_id,
          boardName: r.board_name,
          itemId: r.item_id,
          itemTitle: r.item_title,
          columnId: r.column_id,
          columnName: r.column_name,
          scope,
          preset: classifyPreset(r.events, r.is_muted),
          events: r.events,
          notifyInapp: r.notify_inapp,
          notifyEmail: r.notify_email,
          isMuted: r.is_muted,
          snoozeUntil: r.snooze_until,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }
      }),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return { subscriptions: [], total: 0, limit, offset, hasMore: false }
    }
    console.error('Failed to fetch aggregated subscriptions:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch subscriptions' })
  }
})
