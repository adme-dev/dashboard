/**
 * Delete a banner comment
 * DELETE /api/agency/banner-studio/comments/:id
 */
import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Comment ID is required' })
  }

  await execute('DELETE FROM banner_comments WHERE id = $1', [id])

  return { success: true }
})
