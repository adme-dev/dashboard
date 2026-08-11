// server/api/crm/line-items/[id].patch.ts — edit a line-item (re-derives opp value).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { updateLineItem } from '~~/server/utils/crm/lineItemsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  description: z.string().min(1).max(500).optional(),
  quantity: z.coerce.number().optional(),
  unit_price: z.coerce.number().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const item = await updateLineItem(context, id, {
    description: b.description, quantity: b.quantity, unit_price: b.unit_price, position: b.position,
  })
  return { item }
})
