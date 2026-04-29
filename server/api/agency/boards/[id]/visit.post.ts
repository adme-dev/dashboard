/**
 * Record a board visit for the current user.
 * Returns a watch suggestion if the user has visited this board ≥3 times in
 * the past 7 days WITHOUT having an active subscription.
 *
 * The frontend hits this on board page mount; if `suggestWatch=true` it
 * surfaces a Toast with a one-click subscribe.
 */
import { execute, queryOne } from '~~/server/utils/db'
import { requireBoardAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const user = await requireBoardAccess(event, boardId)

  try {
    // Server-side debounce: skip the INSERT if the same user already logged
    // a visit on this board in the last 5 minutes. Prevents SPA re-mounts
    // from inflating the visit count.
    const recent = await queryOne(
      `SELECT id FROM board_visits
       WHERE user_id = $1 AND board_id = $2
         AND visited_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [user.id, boardId]
    )
    if (!recent) {
      await execute(
        `INSERT INTO board_visits (user_id, board_id) VALUES ($1, $2)`,
        [user.id, boardId]
      )
    }

    // Inline retention prune: drop this user's old visit rows (>30 days).
    // Bounded scope (per-user, per-board) keeps it cheap on each call.
    // Failure is non-blocking — a few stale rows aren't a problem.
    execute(
      `DELETE FROM board_visits
       WHERE user_id = $1 AND board_id = $2
         AND visited_at < NOW() - INTERVAL '30 days'`,
      [user.id, boardId]
    ).catch(() => { /* non-critical */ })

    // Check if user already has a subscription on this board (any scope).
    const existingSub = await queryOne(
      `SELECT id FROM board_subscriptions WHERE user_id = $1 AND board_id = $2 LIMIT 1`,
      [user.id, boardId]
    )
    if (existingSub) {
      return { suggestWatch: false }
    }

    // Count visits in the last 7 days.
    const countRow = await queryOne(
      `SELECT COUNT(*)::int AS count
       FROM board_visits
       WHERE user_id = $1 AND board_id = $2
         AND visited_at > NOW() - INTERVAL '7 days'`,
      [user.id, boardId]
    )
    const recentVisits = countRow?.count || 0
    const threshold = 3

    return {
      suggestWatch: recentVisits >= threshold,
      recentVisits,
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return { suggestWatch: false }
    }
    console.error('Visit log failed:', error)
    return { suggestWatch: false }
  }
})
