/** Rotate the write key. POST /api/agency/tracking/:id/rotate-key */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'
import { invalidateSiteCache } from '~~/server/utils/tracking/site-config'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager'])
  const id = getRouterParam(event, 'id')
  const existing = await queryOne(`SELECT write_key FROM tracking_sites WHERE id = $1`, [id]) as any
  const row = await queryOne(
    `UPDATE tracking_sites SET write_key = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [generateWriteKey(), id]
  ) as any
  if (existing?.write_key) invalidateSiteCache(existing.write_key)
  return { site: row }
})
