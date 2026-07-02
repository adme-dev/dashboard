import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, execute } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/** DELETE /api/agency/social/publishing/campaigns/:id (posts detach via FK SET NULL) */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await queryOne<{ id: string; client_id: string }>(
    'SELECT id, client_id FROM social_campaigns WHERE id = $1',
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  await requireSocialClientAccess(event, existing.client_id)
  await execute('DELETE FROM social_campaigns WHERE id = $1 AND client_id = $2', [id, existing.client_id])
  return { ok: true }
})
