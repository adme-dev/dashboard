import { requirePermission } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { isSocialClientId, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/** DELETE /api/agency/social/feed-rules/:id */
export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const id = getRouterParam(event, 'id')
  if (!isSocialClientId(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid rule id' })
  const existing = await queryOne<{ id: string, client_id: string }>(
    'SELECT id, client_id FROM feed_post_rules WHERE id = $1',
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  await requireSocialClientAccess(event, existing.client_id)
  const deleted = await execute('DELETE FROM feed_post_rules WHERE id = $1 AND client_id = $2', [id, existing.client_id])
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })
  return { success: true }
})
