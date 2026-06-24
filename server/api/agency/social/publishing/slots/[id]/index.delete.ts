import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

/**
 * DELETE /api/agency/social/publishing/slots/:id — remove a posting slot.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  await execute(`DELETE FROM social_slot_schedules WHERE id = $1`, [id])
  return { ok: true }
})
