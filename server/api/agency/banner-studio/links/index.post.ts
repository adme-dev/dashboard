/**
 * Generate a view-only client preview link
 * POST /api/agency/banner-studio/links
 * Body: { projectId, expiresInDays?: number }
 */
import { randomUUID } from 'uncrypto'
import { queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireBannerShareAccess } from '~~/server/utils/banner/shareAccess'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  const body = await readBody(event) || {}
  const { projectId, expiresInDays } = body as {
    projectId: string
    expiresInDays?: number
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }
  const project = await requireBannerShareAccess(event, user, projectId)
  if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose an expiry between 1 and 90 days' })
  }

  // A separate token namespace keeps client previews out of the comment-capable review API.
  const token = `p_${randomUUID().replace(/-/g, '')}`
  const days = Math.min(90, Math.max(1, expiresInDays || 7))
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const row = await queryOneFresh(`
    INSERT INTO banner_review_links (project_id, token, reviewer_name, reviewer_email, expires_at, created_by)
    SELECT $1, $2, NULL, NULL, $3, $4 WHERE EXISTS (
      SELECT 1 FROM banner_projects WHERE id = $1
        AND client_id IS NOT DISTINCT FROM $5::uuid
        AND created_by IS NOT DISTINCT FROM $6::uuid
    )
    RETURNING
      id, project_id AS "projectId", token,
      reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
      expires_at AS "expiresAt", revoked,
      created_at AS "createdAt"
  `, [projectId, token, expiresAt, user.id, project.client_id, project.created_by])
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Project access changed; reload before sharing' })

  setHeader(event, 'Cache-Control', 'private, no-store')
  return row
})
