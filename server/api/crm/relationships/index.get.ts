// server/api/crm/relationships/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listRelationships } from '~~/server/utils/crm/relationshipsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  return { items: await listRelationships(context, q.target_type, q.target_id) }
})
