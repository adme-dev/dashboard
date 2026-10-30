/**
 * Revoke a client preview link
 * DELETE /api/agency/banner-studio/links/:id
 */
import { queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireBannerShareAccess } from '~~/server/utils/banner/shareAccess'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Link ID is required' })
  }

  const link = await queryOneFresh<{ projectId: string }>('SELECT project_id AS "projectId" FROM banner_review_links WHERE id = $1 AND LEFT(token, 2) = \'p_\'', [id])
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Link not found' })
  await requireBannerShareAccess(event, user, link.projectId)
  await queryOneFresh('UPDATE banner_review_links SET revoked = true WHERE id = $1 AND project_id = $2 AND LEFT(token, 2) = \'p_\' RETURNING id', [id, link.projectId])

  setHeader(event, 'Cache-Control', 'private, no-store')
  return { success: true }
})
