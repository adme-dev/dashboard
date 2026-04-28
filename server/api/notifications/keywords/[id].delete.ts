/**
 * Delete a keyword subscription.
 */
import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  const owned = await queryOne(
    `SELECT id FROM keyword_subscriptions WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  )
  if (!owned) {
    throw createError({ statusCode: 404, statusMessage: 'Keyword subscription not found' })
  }
  await execute(`DELETE FROM keyword_subscriptions WHERE id = $1`, [id])
  return { success: true }
})
