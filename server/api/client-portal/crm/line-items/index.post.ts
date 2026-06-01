// server/api/client-portal/crm/line-items/index.post.ts — session-scoped create.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { createLineItem } from '~~/server/utils/crm/lineItemsDb'

const Body = z.object({
  opportunity_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  quantity: z.coerce.number().optional(),
  unit_price: z.coerce.number().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const item = await createLineItem(client.clientId, b.opportunity_id, {
    description: b.description, quantity: b.quantity, unit_price: b.unit_price, position: b.position,
  })
  return { item }
})
