/** Per-client QR settings. GET /api/agency/qr-codes/settings?clientId */
import { z } from 'zod'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const q = z.object({ clientId: z.string().uuid() }).safeParse(getQuery(event))
  if (!q.success) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  await requireClientTrackingAccess(event, q.data.clientId)
  const [row, site] = await Promise.all([
    queryOne<{ export_360: boolean, updated_at: string }>(`SELECT export_360, updated_at FROM qr_client_settings WHERE client_id = $1`, [q.data.clientId]),
    queryOne<{ id: string }>(`SELECT id FROM tracking_sites WHERE client_id = $1 AND is_active = TRUE LIMIT 1`, [q.data.clientId])
  ])
  return { settings: { export360: row?.export_360 ?? false, updatedAt: row?.updated_at ?? null }, trackerInstalled: !!site }
})
