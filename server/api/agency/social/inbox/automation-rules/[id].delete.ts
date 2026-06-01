import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/inbox/automation-rules/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_automation_rules WHERE id = $1`, [id])
  return { ok: true }
})
