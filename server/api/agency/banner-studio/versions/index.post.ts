/**
 * POST /api/agency/banner-studio/versions
 * Create a named version snapshot for a banner project.
 */

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, label, canvasData } = body
  if (!projectId || !canvasData) {
    throw createError({ statusCode: 400, statusMessage: 'projectId and canvasData are required' })
  }

  // Get next version number
  const maxRow = await queryOne(
    `SELECT COALESCE(MAX(version_number), 0) AS max_num FROM banner_versions WHERE project_id = $1`,
    [projectId]
  )
  const nextVersion = ((maxRow as any)?.max_num || 0) + 1

  // Insert version
  const result = await queryOne(
    `INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, version_number, label, created_at`,
    [projectId, nextVersion, JSON.stringify(canvasData), label || `Version ${nextVersion}`, user.id]
  )

  // Prune old versions (keep max 50)
  await execute(
    `DELETE FROM banner_versions
     WHERE project_id = $1
       AND id NOT IN (
         SELECT id FROM banner_versions
         WHERE project_id = $1
         ORDER BY version_number DESC
         LIMIT 50
       )`,
    [projectId]
  )

  return {
    id: (result as any).id,
    versionNumber: (result as any).version_number,
    label: (result as any).label,
    createdAt: (result as any).created_at,
  }
})
