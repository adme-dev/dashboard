import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { assertScopedProjectUnchanged } from '~~/server/utils/banner/scopedCanvasAccess'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })

  const project = await queryOneFresh<{ canvasData: unknown, clientId: string | null, createdBy: string, updatedAt: string }>(
    'SELECT canvas_data AS "canvasData", client_id AS "clientId", created_by AS "createdBy", updated_at AS "updatedAt" FROM banner_projects WHERE id = $1', [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  await transactionWithoutRetry(async (db) => {
    // Deleting the container does not grant source access. Only jobs whose
    // import destination is detached are mutated, so lock those first in order;
    // do not parse or authorize revoked/malformed source content for cleanup.
    const locked = (await db.query<{ job_id: string }>(`SELECT job_id FROM banner_dissections
      WHERE project_id = $1 ORDER BY job_id FOR UPDATE`, [id])).rows
    // Take the project's strongest lock now, after sources and before authority.
    // Authority's FOR SHARE and the snapshot fence's FOR UPDATE then re-enter it;
    // two deletes (or delete + import) never both hold FOR SHARE and deadlock upgrading.
    if (!(await db.query('SELECT id FROM banner_projects WHERE id = $1 FOR UPDATE', [id])).rows.length) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }
    await resolveDissectionContext(db, user.id, { projectId: id }, 'write')
    await assertScopedProjectUnchanged(db, id, project)
    // A new import may have committed between initial job selection and the
    // project lock. Do not lock an extra job after authority/project locks.
    const linked = (await db.query<{ job_id: string }>('SELECT job_id FROM banner_dissections WHERE project_id = $1', [id])).rows
    const lockedIds = new Set(locked.map(row => row.job_id))
    if (linked.some(row => !lockedIds.has(row.job_id))) {
      throw createError({ statusCode: 409, statusMessage: 'Project imports changed. Reload before deleting.' })
    }
    // Only the eventual import destination is nullable. Immutable source owner,
    // source identity and delivery registry survive deletion untouched.
    await db.query('UPDATE banner_dissections SET project_id = NULL WHERE project_id = $1', [id])
    await db.query('DELETE FROM banner_projects WHERE id = $1', [id])
  })
  return { success: true, message: 'Project deleted' }
})
