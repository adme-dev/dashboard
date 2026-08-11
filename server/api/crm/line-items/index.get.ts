// server/api/crm/line-items/index.get.ts — list an opportunity's line-items.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listLineItems } from '~~/server/utils/crm/lineItemsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid(), opportunity_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  return { items: await listLineItems(context, q.opportunity_id) }
})
