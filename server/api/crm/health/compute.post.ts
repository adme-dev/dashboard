// server/api/crm/health/compute.post.ts
// Manually recompute one contact's health score (the HealthPanel "Recompute"
// button). The hourly sweep + in-band hooks keep scores fresh; this is for
// on-demand refresh. Agency-only.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { recomputeHealth } from '~~/server/utils/crm/healthSignals'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  await requireCrmRecordAccess(context, { type: b.target_type, id: b.target_id })
  const item = await recomputeHealth({
    clientId: context.clientId,
    targetType: b.target_type,
    targetId: b.target_id,
    reason: 'manual',
    context
  })
  return { item }
})
