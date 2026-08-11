// server/api/crm/stage-automations/[id].delete.ts — admin.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const n = await execute(
    `DELETE FROM crm_stage_automations WHERE id = $1 AND client_id = $2`,
    [id, context.clientId],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  return { ok: true }
})
