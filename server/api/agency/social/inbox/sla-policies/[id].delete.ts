import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/inbox/sla-policies/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_sla_policies WHERE id = $1`, [id])
  return { ok: true }
})
