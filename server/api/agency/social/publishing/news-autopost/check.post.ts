import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { checkNewsAutopost } from '~~/server/utils/socialNewsAutopost'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const body = await readBody<{ clientId?: string }>(event)
  await requireSocialClientAccess(event, body?.clientId)
  const result = await checkNewsAutopost(body.clientId!, true)
  if (!result) throw createError({ statusCode: 409, statusMessage: 'Save an active news auto-posting rule first' })
  return result
})
