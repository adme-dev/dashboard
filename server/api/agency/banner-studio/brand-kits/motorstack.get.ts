import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireBrandKitWriteAccess } from '~~/server/utils/banner/brandKitAccess'
import { motorstackBinding } from '~~/server/utils/banner/motorstackClient'
import { listMotorstackBrands } from '~~/server/utils/banner/motorstackImport'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  await requireBrandKitWriteAccess(event, null)
  return await listMotorstackBrands(motorstackBinding(event))
})
