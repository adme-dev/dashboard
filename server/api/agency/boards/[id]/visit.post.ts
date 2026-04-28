/**
 * Record a board visit for the current user.
 * Returns a watch suggestion if the user has visited this board ≥3 times in
 * the past 7 days WITHOUT having an active subscription.
 *
 * The frontend hits this on board page mount; if `suggestWatch=true` it
 * surfaces a Toast with a one-click subscribe.
 */
import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const user = await requireBoardAccess(event, boardId)

  try {
    // Insert the visit (fire and forget — never block on this)
    await execute(
      `INSERT INTO board_visits (user_id, board_id) VALUES ($1, $2)`,
      [user.id, boardId]
    )

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
