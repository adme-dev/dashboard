// server/api/crm/assignment-rules/[id].delete.ts — remove a rule (admin only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  await execute(`DELETE FROM crm_assignment_rules WHERE id = $1 AND client_id = $2`, [id, client_id])
  return { ok: true }
})
