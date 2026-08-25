import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { invalidateQrCache } from '~~/server/utils/qr/resolve'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  await executeQrMutation(event, 'code-delete', async (db) => {
    await db.query(`DELETE FROM qr_codes WHERE id = $1`, [row.id])
    return { id: row.id }
  }, async (_db, id) => ({ id }))
  await invalidateQrCache(event, row.code)
  return { ok: true }
})
