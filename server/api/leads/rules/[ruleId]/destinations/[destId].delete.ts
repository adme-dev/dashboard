import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const destId = getRouterParam(event, 'destId')!
  const n = await execute(`DELETE FROM lead_rule_destinations WHERE id = $1`, [destId])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
