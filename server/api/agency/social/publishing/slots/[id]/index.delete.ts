import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * DELETE /api/agency/social/publishing/slots/:id — remove a posting slot.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await queryOne<{ id: string; client_id: string }>(
    'SELECT id, client_id FROM social_slot_schedules WHERE id = $1',
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  await requireSocialClientAccess(event, existing.client_id)
  await execute('DELETE FROM social_slot_schedules WHERE id = $1 AND client_id = $2', [id, existing.client_id])
  return { ok: true }
})
