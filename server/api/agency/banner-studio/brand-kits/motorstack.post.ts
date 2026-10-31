import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireBrandKitWriteAccess } from '~~/server/utils/banner/brandKitAccess'
import { motorstackBinding, motorstackBrandId } from '~~/server/utils/banner/motorstackClient'
import { importMotorstackBrand } from '~~/server/utils/banner/motorstackImport'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  await requireBrandKitWriteAccess(event, null)
  const parsed = z.object({ brandId: motorstackBrandId }).strict().safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid MotorStack brand ID is required' })
  return await importMotorstackBrand(event, motorstackBinding(event), parsed.data.brandId, user.id)
})
