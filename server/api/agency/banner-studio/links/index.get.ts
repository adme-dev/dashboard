/**
 * List review links for a project
 * GET /api/agency/banner-studio/links?projectId=xxx
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  return queryRows(`
    SELECT
      id, project_id AS "projectId", token,
      reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
      expires_at AS "expiresAt", revoked,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM banner_review_links
    WHERE project_id = $1
    ORDER BY created_at DESC
  `, [projectId])
})
