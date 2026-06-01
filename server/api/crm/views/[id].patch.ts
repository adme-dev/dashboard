// server/api/crm/views/[id].patch.ts — update a saved view (creator only).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { updateView } from '~~/server/utils/crm/viewsDb'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  filters: z.any().optional(),
  columns: z.array(z.string()).optional(),
  is_shared: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  return await updateView(id, b.client_id, user.id, {
    name: b.name, filters: b.filters, columns: b.columns, isShared: b.is_shared,
  })
})
