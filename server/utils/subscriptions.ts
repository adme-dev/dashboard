import { queryOne, queryRows, execute } from '~~/server/utils/db'

/**
 * Auto-subscribe a user to a board/item (idempotent).
 * Uses INSERT ... ON CONFLICT DO NOTHING so it's safe to call repeatedly.
 */
export async function autoSubscribe(userId: string, boardId: string, itemId?: string): Promise<void> {
  // The UNIQUE constraint uses COALESCE on both item_id and column_id.
  // We must include column_id in the INSERT (as NULL) so the ON CONFLICT expression matches.
  await execute(`
    INSERT INTO board_subscriptions (user_id, board_id, item_id, column_id, events, notify_inapp, notify_email)
    VALUES ($1, $2, $3, NULL, '{}', true, false)
    ON CONFLICT (user_id, board_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'), COALESCE(column_id, '00000000-0000-0000-0000-000000000000'))
    DO NOTHING
  `, [userId, boardId, itemId || null])
}

/**
 * Auto-subscribe respecting the user's `auto_subscribe_on_participation` preference.
 * Used by participation triggers (task creation, comment, assignment, mention).
 * Wrap in try/catch at call site — failure here must never break the primary action.
 */
export async function autoSubscribeIfEnabled(userId: string, boardId: string, itemId?: string): Promise<void> {
  const row = await queryOne(
    `SELECT auto_subscribe_on_participation FROM team_members WHERE id = $1`,
    [userId]
  )
  // Default true if column missing (Phase A pre-migration) or row not found.
  if (row?.auto_subscribe_on_participation === false) return
  await autoSubscribe(userId, boardId, itemId)
}

/**
 * Get all subscribers who should be notified for a given event.
 * Checks board-level, item-level, and column-level subscriptions.
 * Filters by event type and muted status.
 */
export async function getSubscribers(params: {
  boardId: string
  itemId?: string
  columnId?: string
  eventType: string
}): Promise<Array<{ userId: string; notifyInapp: boolean; notifyEmail: boolean; itemId: string | null }>> {
  const { boardId, itemId, columnId, eventType } = params

  // Build conditions to match board-level, item-level, and column-level subs
  const conditions: string[] = [
    'bs.board_id = $1',
    'bs.is_muted = false',
    '(bs.snooze_until IS NULL OR bs.snooze_until <= NOW())',
  ]
  const values: any[] = [boardId]
  let idx = 2

  // Scope: board-level (item_id IS NULL) OR matching item OR matching column
  const scopeParts: string[] = ['bs.item_id IS NULL AND bs.column_id IS NULL']
  if (itemId) {
    scopeParts.push(`bs.item_id = $${idx}`)
    values.push(itemId)
    idx++
  }
  if (columnId) {
    scopeParts.push(`bs.column_id = $${idx}`)
    values.push(columnId)
    idx++
  }
  conditions.push(`(${scopeParts.join(' OR ')})`)

  // Event filter: empty array means all events, otherwise must contain the event type
  conditions.push(`(bs.events = '{}' OR bs.events @> ARRAY[$${idx}]::text[])`)
  values.push(eventType)

  const rows = await queryRows(`
    SELECT DISTINCT ON (bs.user_id)
      bs.user_id,
      bs.notify_inapp,
      bs.notify_email,
      bs.item_id
    FROM board_subscriptions bs
    WHERE ${conditions.join(' AND ')}
    ORDER BY bs.user_id, bs.item_id NULLS LAST
  `, values)

  return rows.map(r => ({
    userId: r.user_id,
    notifyInapp: r.notify_inapp,
    notifyEmail: r.notify_email,
    itemId: r.item_id,
  }))
}

/**
 * Check if a user is subscribed to a board/item.
 */
export async function isSubscribed(userId: string, boardId: string, itemId?: string): Promise<boolean> {
  const row = await queryOne(`
    SELECT id FROM board_subscriptions
    WHERE user_id = $1 AND board_id = $2
      AND item_id IS NOT DISTINCT FROM $3
      AND column_id IS NULL
    LIMIT 1
  `, [userId, boardId, itemId || null])

  return !!row
}
