// server/api/client-portal/crm/views/[id].patch.ts — update a saved view (creator only).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { updateView } from '~~/server/utils/crm/viewsDb'

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  filters: z.any().optional(),
  columns: z.array(z.string()).optional(),
  is_shared: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  return await updateView(id, client.clientId, client.id, {
    name: b.name, filters: b.filters, columns: b.columns, isShared: b.is_shared,
  })
})
