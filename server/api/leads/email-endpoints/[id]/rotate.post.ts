import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { rotateEmailEndpoint, toSafeEmailEndpoint } from '~~/server/utils/leads/emailEndpoint'

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  return { endpoint: toSafeEmailEndpoint(await rotateEmailEndpoint(id, actor.id)) }
})
