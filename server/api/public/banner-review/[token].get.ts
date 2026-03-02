/**
 * Get project data for public review (token-based, no auth)
 * GET /api/public/banner-review/:token
 */
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Review token is required' })
  }

  // Validate token
  const link = await queryOne(`
    SELECT id, project_id AS "projectId", expires_at AS "expiresAt", revoked
    FROM banner_review_links
    WHERE token = $1
  `, [token])

  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Review link not found' })
  }

  const linkData = link as any

  if (linkData.revoked) {
    throw createError({ statusCode: 410, statusMessage: 'This review link has been revoked' })
  }

  if (linkData.expiresAt && new Date(linkData.expiresAt) < new Date()) {
    throw createError({ statusCode: 410, statusMessage: 'This review link has expired' })
  }

  // Get project data
  const project = await queryOne(`
    SELECT
      id, name,
      canvas_data AS "canvasData",
      review_status AS "reviewStatus",
      created_at AS "createdAt"
    FROM banner_projects
    WHERE id = $1
  `, [linkData.projectId])

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Get existing comments
  const comments = await queryRows(`
    SELECT
      c.id, c.format_key AS "formatKey", c.x, c.y, c.text,
      c.reviewer_name AS "reviewerName", c.reviewer_email AS "reviewerEmail",
      c.parent_id AS "parentId", c.resolved,
      c.created_at AS "createdAt",
      u.name AS "userName"
    FROM banner_comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.project_id = $1 AND c.format_key != '__review__'
    ORDER BY c.created_at ASC
  `, [linkData.projectId])

  return {
    project,
    comments,
    linkId: linkData.id,
  }
})
