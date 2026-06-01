// server/api/crm/views/index.post.ts — create a saved view.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { createView } from '~~/server/utils/crm/viewsDb'

const Body = z.object({
  client_id: z.string().uuid(),
  entity: z.enum(['people', 'companies', 'opportunities']),
  name: z.string().min(1).max(120),
  filters: z.any().optional(),
  columns: z.array(z.string()).optional(),
  is_shared: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  return await createView({
    clientId: b.client_id, entity: b.entity, name: b.name,
    filters: b.filters, columns: b.columns, isShared: b.is_shared, userId: user.id,
  })
})
