/**
 * Revoke an analytics export token (soft — sets revoked_at).
 * DELETE /api/agency/analytics/export-tokens/:id
 */
import { execute } from '~~/server/utils/db'
import { requireRole, hasRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'token id required' })
  }
  // Only the token's creator or an admin (incl. custom admin roles) may revoke it.
  const isAdmin = hasRole(user, PERMISSIONS.ADMIN)
  const affected = await execute(
    `UPDATE analytics_export_tokens SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL AND (created_by = $2 OR $3::boolean)`,
    [id, user.id, isAdmin]
  )
  if (affected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found or already revoked' })
  }
  return { ok: true }
})
