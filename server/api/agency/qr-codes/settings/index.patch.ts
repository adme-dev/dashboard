/** Update per-client QR settings. PATCH /api/agency/qr-codes/settings */
import { z } from 'zod'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { resetQr360Cache } from '~~/server/utils/qr/export360'

const Body = z.object({ clientId: z.string().uuid(), export360: z.boolean() }).strict()

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const b = parsed.data
  const user = await requireClientTrackingAccess(event, b.clientId)
  const row = await executeQrMutation(event, 'settings-update', async (db) => {
    const r = await db.query(
      `INSERT INTO qr_client_settings (client_id, export_360, updated_by) VALUES ($1,$2,$3)
       ON CONFLICT (client_id) DO UPDATE SET export_360 = EXCLUDED.export_360, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING client_id AS id, export_360, updated_at`, [b.clientId, b.export360, user.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT client_id AS id, export_360, updated_at FROM qr_client_settings WHERE client_id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed settings row no longer exists')
    return r.rows[0]
  })
  resetQr360Cache()
  return { settings: { export360: row.export_360, updatedAt: row.updated_at } }
})
