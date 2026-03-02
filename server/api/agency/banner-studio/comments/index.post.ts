/**
 * Create a comment on a banner project
 * POST /api/agency/banner-studio/comments
 * Body: { projectId, formatKey, x, y, text, parentId? }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { projectId, formatKey, x, y, text, parentId } = body as {
    projectId: string
    formatKey: string
    x: number
    y: number
    text: string
    parentId?: string
  }

  if (!projectId || !formatKey || typeof text !== 'string' || !text.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'projectId, formatKey, and text are required' })
  }

  const row = await queryOne(`
    INSERT INTO banner_comments (project_id, format_key, x, y, text, user_id, parent_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      x, y, text, user_id AS "userId",
      parent_id AS "parentId", resolved,
      created_at AS "createdAt", updated_at AS "updatedAt"
  `, [projectId, formatKey, x || 0, y || 0, text.trim(), user.id, parentId || null])

  return row
})
