/** Create a named snapshot; protected lineage remains bound to fresh source access. */
import { queryOne, queryOneFresh, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasScopedCanvas } from '#shared/bannerScopedCanvas'
import { assertScopedCanvasLineage, withScopedCanvasAccess, assertScopedProjectUnchanged } from '~~/server/utils/banner/scopedCanvasAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { projectId, label, canvasData } = await readBody(event)
  if (!projectId || !canvasData) {
    throw createError({ statusCode: 400, statusMessage: 'projectId and canvasData are required' })
  }
  const saved = await queryOneFresh<{ canvasData: unknown, clientId: string | null, createdBy: string, updatedAt: string }>(
    'SELECT canvas_data AS "canvasData", client_id AS "clientId", created_by AS "createdBy", updated_at AS "updatedAt" FROM banner_projects WHERE id = $1', [projectId])
  if (!saved) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertScopedCanvasLineage(saved.canvasData, canvasData)
  const protectedCanvas = hasScopedCanvas(saved.canvasData) || hasScopedCanvas(canvasData)
  const create = async (query: typeof queryOne, prune: (sql: string, params: any[]) => Promise<unknown>) => {
    const maxRow = await query<{ max_num: number }>(
      'SELECT COALESCE(MAX(version_number), 0) AS max_num FROM banner_versions WHERE project_id = $1', [projectId])
    const nextVersion = (maxRow?.max_num || 0) + 1
    const result = await query<any>(
      `INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, version_number, label, created_at`,
      [projectId, nextVersion, JSON.stringify(canvasData), label || `Version ${nextVersion}`, user.id])
    await prune(`DELETE FROM banner_versions WHERE project_id = $1 AND id NOT IN (
      SELECT id FROM banner_versions WHERE project_id = $1 ORDER BY version_number DESC LIMIT 50)`, [projectId])
    return { id: result.id, versionNumber: result.version_number, label: result.label, createdAt: result.created_at }
  }
  if (protectedCanvas) {
    return withScopedCanvasAccess(user.id, [saved.canvasData, canvasData], projectId, 'write', async db => {
      await assertScopedProjectUnchanged(db, projectId, saved)
      return create(async (sql, params) => (await db.query<any>(sql, params)).rows[0] ?? null,
        (sql, params) => db.query(sql, params))
    })
  }
  return create(queryOne, execute)
})
