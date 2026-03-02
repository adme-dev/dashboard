/**
 * List A/B tests for a project
 * GET /api/agency/banner-studio/ab-tests?projectId=xxx
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
      t.id, t.project_id AS "projectId",
      t.format_key AS "formatKey",
      t.name, t.status, t.variants,
      t.winner_id AS "winnerId",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      u.name AS "createdByName"
    FROM banner_ab_tests t
    LEFT JOIN team_members u ON u.id = t.created_by
    WHERE t.project_id = $1
    ORDER BY t.created_at DESC
  `, [projectId])
})
