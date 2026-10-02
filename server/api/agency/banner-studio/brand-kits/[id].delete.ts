import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { lockBrandKitForWrite } from '~~/server/utils/banner/brandKitAccess'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')!
  await transaction(async (db) => {
    await lockBrandKitForWrite(event, db, id)
    await db.query('DELETE FROM brand_kits WHERE id = $1', [id])
  })
  return { success: true }
})
