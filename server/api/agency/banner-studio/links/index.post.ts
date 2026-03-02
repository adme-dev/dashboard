/**
 * Generate a shareable review link
 * POST /api/agency/banner-studio/links
 * Body: { projectId, reviewerName?, reviewerEmail?, expiresInDays?: number }
 */
import { randomUUID } from 'uncrypto'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { projectId, reviewerName, reviewerEmail, expiresInDays } = body as {
    projectId: string
    reviewerName?: string
    reviewerEmail?: string
    expiresInDays?: number
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const token = randomUUID().replace(/-/g, '')
  const days = Math.min(90, Math.max(1, expiresInDays || 7))
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const row = await queryOne(`
    INSERT INTO banner_review_links (project_id, token, reviewer_name, reviewer_email, expires_at, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id, project_id AS "projectId", token,
      reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
      expires_at AS "expiresAt", revoked,
      created_at AS "createdAt"
  `, [projectId, token, reviewerName || null, reviewerEmail || null, expiresAt, user.id])

  return row
})
