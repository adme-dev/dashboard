import { validateCanvasFontAssets } from '~~/server/utils/banner/fontAssets'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

/** Restore with the current client, font references and version backup locked together. */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { versionId } = await readBody(event) as { versionId?: string }
  if (!versionId) throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
  return await transaction(async (db) => {
    const version = (await db.query<{ projectId: string, canvasData: unknown }>(`
      SELECT project_id AS "projectId", canvas_data AS "canvasData" FROM banner_versions WHERE id = $1
    `, [versionId])).rows[0]
    if (!version) throw createError({ statusCode: 404, statusMessage: 'Version not found' })
    const project = (await db.query<{ canvas_data: unknown, client_id: string | null }>(`
      SELECT canvas_data, client_id FROM banner_projects WHERE id = $1 FOR UPDATE
    `, [version.projectId])).rows[0]
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    if (project.client_id) await requireSocialClientAccess(event, project.client_id)
    await validateCanvasFontAssets(version.canvasData, project.client_id, db)
    await db.query(`
      INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
      SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2::jsonb, $3, $4 FROM banner_versions WHERE project_id = $1
    `, [version.projectId, JSON.stringify(project.canvas_data), 'Auto-save before restore', user.id])
    return (await db.query(`
      UPDATE banner_projects SET canvas_data = $1, updated_at = NOW() WHERE id = $2
      RETURNING id, name, canvas_data AS "canvasData", updated_at AS "updatedAt"
    `, [JSON.stringify(version.canvasData), version.projectId])).rows[0]
  })
})
