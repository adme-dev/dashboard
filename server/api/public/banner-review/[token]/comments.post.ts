/**
 * Add a comment from external reviewer (no auth, token-based)
 * POST /api/public/banner-review/:token/comments
 * Body: { formatKey, x, y, text, name, email, parentId? }
 */
import { queryOne } from '~~/server/utils/db'

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

  const body = await readBody(event)
  const { formatKey, x, y, text, name, email, parentId } = body as {
    formatKey: string
    x: number
    y: number
    text: string
    name: string
    email?: string
    parentId?: string
  }

  if (!formatKey || typeof text !== 'string' || !text.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'formatKey and text are required' })
  }

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required for external reviewers' })
  }

  const row = await queryOne(`
    INSERT INTO banner_comments (project_id, format_key, x, y, text, reviewer_name, reviewer_email, parent_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      x, y, text,
      reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
      parent_id AS "parentId", resolved,
      created_at AS "createdAt"
  `, [
    linkData.projectId,
    formatKey,
    x || 0,
    y || 0,
    text.trim(),
    name.trim(),
    email?.trim() || null,
    parentId || null,
  ])

  return row
})
