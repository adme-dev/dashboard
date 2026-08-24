import { execute } from '~~/server/utils/db'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { invalidateQrCache } from '~~/server/utils/qr/resolve'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  await execute(`DELETE FROM qr_codes WHERE id = $1`, [row.id])
  await invalidateQrCache(event, row.code)
  return { ok: true }
})
