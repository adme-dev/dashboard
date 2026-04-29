/**
 * Delete a keyword subscription. Also removes the embedded vector from
 * Vectorize when present, so semantic match doesn't return stale matches.
 */
import { execute, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteVector } from '~~/server/utils/aiVectorize'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  const owned = await queryOne(
    `SELECT id, vector_id FROM keyword_subscriptions WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  )
  if (!owned) {
    throw createError({ statusCode: 404, statusMessage: 'Keyword subscription not found' })
  }

  if (owned.vector_id) {
    try {
      await deleteVector(event, owned.vector_id)
    } catch (err) {
      console.error('[keywords] Vector delete failed:', err)
    }
  }

  await execute(`DELETE FROM keyword_subscriptions WHERE id = $1`, [id])
  return { success: true }
})
