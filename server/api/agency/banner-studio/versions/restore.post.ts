/**
 * Restore a project to a specific version
 * POST /api/agency/banner-studio/versions/restore
 * Body: { versionId }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { versionId } = body as { versionId: string }

  if (!versionId) {
    throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
  }

  // Fetch the version to restore
  const version = await queryOne(`
    SELECT project_id AS "projectId", canvas_data AS "canvasData"
    FROM banner_versions
    WHERE id = $1
  `, [versionId]) as any

  if (!version) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }

  // Snapshot current state before restoring (so user can undo the restore)
  const currentProject = await queryOne(`
    SELECT canvas_data FROM banner_projects WHERE id = $1
  `, [version.projectId]) as any

  if (currentProject) {
    // Get next version number
    const maxRow = await queryOne(`
      SELECT COALESCE(MAX(version_number), 0) AS "maxVersion"
      FROM banner_versions WHERE project_id = $1
    `, [version.projectId]) as any

    const nextVersion = (maxRow?.maxVersion || 0) + 1

    // Save current state as a snapshot before restoring
    await queryOne(`
      INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      version.projectId,
      nextVersion,
      JSON.stringify(currentProject.canvas_data),
      'Auto-save before restore',
      user.id,
    ])
  }

  // Apply the version's canvas data to the project
  const updated = await queryOne(`
    UPDATE banner_projects
    SET canvas_data = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING
      id, name,
      canvas_data AS "canvasData",
      updated_at AS "updatedAt"
  `, [JSON.stringify(version.canvasData), version.projectId])

  return updated
})
