import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/posts/:id
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const row = await queryOne('SELECT * FROM social_posts WHERE id = $1', [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await requireSocialClientAccess(event, (row as { client_id: string }).client_id)
  return row
})
