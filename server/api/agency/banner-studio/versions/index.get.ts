import { assertScopedCanvasAccess } from '~~/server/utils/banner/scopedCanvasAccess'
/**
 * List version history for a project
 * GET /api/agency/banner-studio/versions?projectId=xxx
 */
import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const rows = await queryRowsFresh(`
    SELECT
      v.canvas_data AS "canvasData", v.id, v.version_number AS "versionNumber",
      v.label, v.created_at AS "createdAt",
      u.name AS "createdByName"
    FROM banner_versions v
    LEFT JOIN team_members u ON u.id = v.created_by
    WHERE v.project_id = $1
    ORDER BY v.version_number DESC
  `, [projectId])
  for (const row of rows) await assertScopedCanvasAccess(user.id, row.canvasData, projectId)
  return rows.map(({ canvasData, ...summary }) => summary)
})
