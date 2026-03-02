/**
 * Revoke a review link
 * DELETE /api/agency/banner-studio/links/:id
 */
import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Link ID is required' })
  }

  await execute(
    'UPDATE banner_review_links SET revoked = true WHERE id = $1',
    [id],
  )

  return { success: true }
})
