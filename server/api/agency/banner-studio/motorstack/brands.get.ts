import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { motorstackBinding, boundedMotorstackCall, motorstackListSchema } from '~~/server/utils/banner/motorstackClient'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const result = motorstackListSchema.safeParse(await boundedMotorstackCall(motorstackBinding(event).listBrands()))
  if (!result.success) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid brands' })
  return { brands: result.data.brands }
})
