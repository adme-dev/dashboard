// server/api/crm/dedupe/suggestions.get.ts
// Suggest likely-duplicate contacts for a client (in-app blocked scan over the
// client's bounded contact set; pg_trgm indexes back a future scale-up).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { findDedupeSuggestions } from '~~/server/utils/crm/dedupe'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  entity_type: z.enum(['person', 'company']).default('person'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  return { items: await findDedupeSuggestions(context, { entityType: q.entity_type, limit: q.limit }) }
})
