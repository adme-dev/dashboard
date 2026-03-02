/**
 * Get a specific version's full canvas data
 * GET /api/agency/banner-studio/versions/:id
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Version ID is required' })
  }

  const row = await queryOne(`
    SELECT
      v.id, v.project_id AS "projectId",
      v.version_number AS "versionNumber",
      v.canvas_data AS "canvasData",
      v.label, v.created_at AS "createdAt",
      u.name AS "createdByName"
    FROM banner_versions v
    LEFT JOIN team_members u ON u.id = v.created_by
    WHERE v.id = $1
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }

  return row
})
