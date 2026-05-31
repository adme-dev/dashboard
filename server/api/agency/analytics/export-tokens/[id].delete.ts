/**
 * Revoke an analytics export token (soft — sets revoked_at).
 * DELETE /api/agency/analytics/export-tokens/:id
 */
import { execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'token id required' })
  }
  await execute(`UPDATE analytics_export_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [id])
  return { ok: true }
})
