/**
 * List comments for a banner project
 * GET /api/agency/banner-studio/comments?projectId=xxx&formatKey=yyy
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectId, formatKey } = getQuery(event) as {
    projectId?: string
    formatKey?: string
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  let sql = `
    SELECT
      c.id, c.project_id AS "projectId", c.format_key AS "formatKey",
      c.x, c.y, c.text, c.user_id AS "userId",
      c.reviewer_name AS "reviewerName", c.reviewer_email AS "reviewerEmail",
      c.parent_id AS "parentId", c.resolved, c.resolved_by AS "resolvedBy",
      c.created_at AS "createdAt", c.updated_at AS "updatedAt",
      u.name AS "userName", u.avatar_url AS "userAvatar"
    FROM banner_comments c
    LEFT JOIN team_members u ON u.id = c.user_id
    WHERE c.project_id = $1
  `
  const params: any[] = [projectId]

  if (formatKey) {
    sql += ' AND c.format_key = $2'
    params.push(formatKey)
  }

  sql += ' ORDER BY c.created_at ASC'

  return queryRows(sql, params)
})
