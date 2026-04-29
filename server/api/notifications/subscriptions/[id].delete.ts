/**
 * Delete a subscription by ID (used by the My Subscriptions page).
 * Verifies the subscription belongs to the current user before deleting.
 */
import { execute, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const subId = getRouterParam(event, 'id')

  if (!subId) {
    throw createError({ statusCode: 400, statusMessage: 'Subscription ID is required' })
  }

  const owned = await queryOne(
    `SELECT id FROM board_subscriptions WHERE id = $1 AND user_id = $2`,
    [subId, user.id]
  )
  if (!owned) {
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  }

  await execute(`DELETE FROM board_subscriptions WHERE id = $1`, [subId])

  return { success: true }
})
