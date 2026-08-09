// server/api/crm/targets/index.post.ts — set (upsert) a per-rep sales target.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { upsertTarget } from '~~/server/utils/crm/targetsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  target_type: z.enum(['revenue', 'count']),
  target_value: z.coerce.number().min(0),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  if (context.visibility.ownerScoped && context.actorType === 'staff' && b.user_id !== context.actorId) {
    throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  }
  const item = await upsertTarget({
    clientId: context.clientId, userId: b.user_id, periodStart: b.period_start, periodEnd: b.period_end,
    targetType: b.target_type, targetValue: b.target_value, createdBy: context.actorId,
  })
  return { item }
})
