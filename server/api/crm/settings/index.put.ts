// server/api/crm/settings/index.put.ts — set record visibility (admin only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  record_visibility: z.enum(['team', 'owner']),
  // Days of inactivity before an 'active' contact auto-goes dormant (P4.1 F5).
  // Omit to leave unchanged; null clears it back to the app default.
  dormancy_days: z.number().int().positive().max(3650).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const setDormancy = b.dormancy_days !== undefined
  const row = await queryOne<{ record_visibility: string, dormancy_days: number | null }>(
    `INSERT INTO crm_settings (client_id, record_visibility, dormancy_days)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET
       record_visibility = EXCLUDED.record_visibility,
       dormancy_days = CASE WHEN $4 THEN EXCLUDED.dormancy_days ELSE crm_settings.dormancy_days END,
       updated_at = NOW()
     RETURNING record_visibility, dormancy_days`,
    [b.client_id, b.record_visibility, b.dormancy_days ?? null, setDormancy],
  )
  return { record_visibility: row?.record_visibility ?? b.record_visibility, dormancy_days: row?.dormancy_days ?? null }
})
