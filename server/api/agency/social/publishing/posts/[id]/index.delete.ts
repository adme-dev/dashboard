import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'

/**
 * DELETE /api/agency/social/publishing/posts/:id
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const post = await requireSocialPostClientAccess(event, id)
  await execute('DELETE FROM social_posts WHERE id = $1 AND client_id = $2', [id, post.client_id])
  return { ok: true }
})
