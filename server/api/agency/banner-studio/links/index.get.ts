/**
 * List client preview links for a project
 * GET /api/agency/banner-studio/links?projectId=xxx
 */
import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { requireBannerShareAccess } from '~~/server/utils/banner/shareAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  await requireBannerShareAccess(event, user, projectId)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return queryRowsFresh(`
    SELECT
      id, project_id AS "projectId", token,
      reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
      expires_at AS "expiresAt", revoked,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM banner_review_links
    WHERE project_id = $1 AND LEFT(token, 2) = 'p_'
    ORDER BY created_at DESC
  `, [projectId])
})
