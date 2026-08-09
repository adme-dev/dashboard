// server/api/crm/bulk.post.ts
// F9 — one-request bulk mutation over a list of records. Client-scoped (rows of
// other clients are never matched, so the id list can't reach across tenants).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { runBulk } from '~~/server/utils/crm/bulk'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  entity: z.enum(['people', 'companies', 'opportunities']),
  action: z.enum(['assign', 'tag', 'untag', 'status', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(500),
  payload: z.record(z.string(), z.any()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  return await runBulk(context, { entity: b.entity, action: b.action, ids: b.ids, payload: b.payload })
})
