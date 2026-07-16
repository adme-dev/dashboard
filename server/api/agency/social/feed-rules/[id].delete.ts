import { requirePermission } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/feed-rules/:id */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const id = getRouterParam(event, 'id')
  await execute(`DELETE FROM feed_post_rules WHERE id = $1`, [id])
  return { success: true }
})
