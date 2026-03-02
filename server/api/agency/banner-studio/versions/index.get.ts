/**
 * List version history for a project
 * GET /api/agency/banner-studio/versions?projectId=xxx
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
      v.id, v.version_number AS "versionNumber",
      v.label, v.created_at AS "createdAt",
      u.name AS "createdByName"
    FROM banner_versions v
    LEFT JOIN team_members u ON u.id = v.created_by
    WHERE v.project_id = $1
    ORDER BY v.version_number DESC
  `, [projectId])
})
