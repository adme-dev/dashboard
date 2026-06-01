// server/api/crm/settings/index.put.ts — set record visibility (admin only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  record_visibility: z.enum(['team', 'owner']),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_settings (client_id, record_visibility)
     VALUES ($1, $2)
     ON CONFLICT (client_id) DO UPDATE SET record_visibility = EXCLUDED.record_visibility, updated_at = NOW()
     RETURNING record_visibility`,
    [b.client_id, b.record_visibility],
  )
  return { record_visibility: row?.record_visibility ?? b.record_visibility }
})
