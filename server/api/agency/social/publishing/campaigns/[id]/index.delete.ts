import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/** DELETE /api/agency/social/publishing/campaigns/:id (posts detach via FK SET NULL) */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  await execute('DELETE FROM social_campaigns WHERE id = $1', [id])
  return { ok: true }
})
