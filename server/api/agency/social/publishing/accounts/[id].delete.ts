import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

/**
 * DELETE /api/agency/social/publishing/accounts/:id
 * Disconnect a publishing account. CREATIVE-permission gated.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  await execute('DELETE FROM social_accounts WHERE id = $1', [id])
  return { ok: true }
})
