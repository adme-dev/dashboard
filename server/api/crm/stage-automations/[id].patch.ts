// server/api/crm/stage-automations/[id].patch.ts — admin: toggle active.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({ client_id: z.string().uuid(), is_active: z.boolean() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await queryOne(
    `UPDATE crm_stage_automations SET is_active = $1 WHERE id = $2 AND client_id = $3 RETURNING *`,
    [b.is_active, id, context.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  return { item: row }
})
