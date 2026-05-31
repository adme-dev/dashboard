// server/api/crm/activities/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
  type: z.enum(['note', 'call', 'email', 'meeting', 'task', 'stage_change', 'system']).default('note'),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_activities (client_id, target_type, target_id, type, title, body, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.client_id, b.target_type, b.target_id, b.type, b.title, b.body ?? null, b.scheduled_at ?? null, user.id],
  )
  return { item: row }
})
