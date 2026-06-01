import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/posts/:id
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const row = await queryOne('SELECT * FROM social_posts WHERE id = $1', [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return row
})
