// server/api/client-portal/crm/line-items/[id].patch.ts — session-scoped edit.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { updateLineItem } from '~~/server/utils/crm/lineItemsDb'

const Body = z.object({
  description: z.string().min(1).max(500).optional(),
  quantity: z.coerce.number().optional(),
  unit_price: z.coerce.number().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const item = await updateLineItem(client.clientId, id, b)
  return { item }
})
