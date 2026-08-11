// server/api/crm/targets/[id].delete.ts — remove a sales target.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { deleteTarget } from '~~/server/utils/crm/targetsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { queryOne } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  if (context.visibility.ownerScoped && context.actorType === 'staff') {
    const target = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM crm_sales_targets WHERE id = $1 AND client_id = $2`,
      [id, context.clientId]
    )
    if (!target || target.user_id !== context.actorId) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }
  const ok = await deleteTarget(id, context.clientId)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Target not found' })
  return { ok: true }
})
