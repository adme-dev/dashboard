import { assertNoScopedDissectionReferences, assertProjectAllowsUnprotectedFlow } from '~~/server/utils/banner/scopedExport'
import { resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
/**
 * Generate a shareable review link
 * POST /api/agency/banner-studio/links
 * Body: { projectId, reviewerName?, reviewerEmail?, expiresInDays?: number }
 */
import { randomUUID } from 'uncrypto'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

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

  await assertProjectAllowsUnprotectedFlow(projectId, body)

  const token = randomUUID().replace(/-/g, '')
  const days = Math.min(90, Math.max(1, expiresInDays || 7))
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  return transactionWithoutRetry(async db => {
    await resolveDissectionContext(db, user.id, { projectId }, 'write')
    const saved = (await db.query('SELECT canvas_data FROM banner_projects WHERE id = $1 FOR SHARE', [projectId])).rows[0]
    if (!saved) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    assertNoScopedDissectionReferences(saved.canvas_data)
    const result = await db.query(`
      INSERT INTO banner_review_links (project_id, token, reviewer_name, reviewer_email, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id, project_id AS "projectId", token,
        reviewer_name AS "reviewerName", reviewer_email AS "reviewerEmail",
        expires_at AS "expiresAt", revoked,
        created_at AS "createdAt"
    `, [projectId, token, reviewerName || null, reviewerEmail || null, expiresAt, user.id])

    return result.rows[0]
  })
})
