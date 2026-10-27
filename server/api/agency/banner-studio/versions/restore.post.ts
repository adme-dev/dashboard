/**
 * Restore a project to a specific version
 * POST /api/agency/banner-studio/versions/restore
 * Body: { versionId }
 */
import { queryOne, queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { validateBannerPlatformQrCanvas } from '~~/server/utils/banner/platformQrCanvas'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody(event)
  const { versionId, expectedRevision } = body as { versionId: string, expectedRevision?: string }

  if (!versionId) {
    throw createError({ statusCode: 400, statusMessage: 'versionId is required' })
  }
  if (expectedRevision !== undefined && (typeof expectedRevision !== 'string' || !Number.isFinite(Date.parse(expectedRevision)))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid saved project revision' })
  }

  // Fetch the version to restore
  const version = await queryOneFresh<{ projectId: string, canvasData: unknown }>(`
    SELECT project_id AS "projectId", canvas_data AS "canvasData"
    FROM banner_versions
    WHERE id = $1
  `, [versionId])

  if (!version) {
    throw createError({ statusCode: 404, statusMessage: 'Version not found' })
  }

  // Snapshot current state before restoring (so user can undo the restore)
  const currentProject = await queryOneFresh<{ canvasData: unknown, clientId: string | null, createdBy: string, updatedAt: string }>(`
    SELECT canvas_data AS "canvasData", client_id AS "clientId", created_by AS "createdBy", updated_at AS "updatedAt"
    FROM banner_projects WHERE id = $1
  `, [version.projectId])
  if (!currentProject) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (currentProject.clientId) await requireSocialClientAccess(event, currentProject.clientId)
  else if (currentProject.createdBy !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
  if (expectedRevision && new Date(currentProject.updatedAt).getTime() !== Date.parse(expectedRevision)) {
    throw createError({ statusCode: 409, statusMessage: 'Artwork changed elsewhere. Reload before restoring.' })
  }
  await validateBannerPlatformQrCanvas(event, currentProject.canvasData, version.canvasData, currentProject.clientId)

  if (currentProject) {
    // Get next version number
    const maxRow = await queryOne<{ maxVersion: number }>(`
      SELECT COALESCE(MAX(version_number), 0) AS "maxVersion"
      FROM banner_versions WHERE project_id = $1
    `, [version.projectId])

    const nextVersion = (maxRow?.maxVersion || 0) + 1

    // Save current state as a snapshot before restoring
    await queryOne(`
      INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      version.projectId,
      nextVersion,
      JSON.stringify(currentProject.canvasData),
      'Auto-save before restore',
      user.id
    ])
  }

  // Apply the version's canvas data to the project
  const updated = await queryOne(`
    UPDATE banner_projects
    SET canvas_data = $1,
      updated_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')
    WHERE id = $2 AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)
    RETURNING
      id, name,
      canvas_data AS "canvasData",
      updated_at AS "updatedAt"
  `, [JSON.stringify(version.canvasData), version.projectId, currentProject.updatedAt])
  if (!updated) throw createError({ statusCode: 409, statusMessage: 'Artwork changed elsewhere. Reload before restoring.' })

  return updated
})
