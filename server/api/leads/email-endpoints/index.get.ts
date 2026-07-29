import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { listEmailEndpoints } from '~~/server/utils/leads/emailEndpoint'

const Query = z.object({ client_id: z.string().uuid() }).strict()

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const query = Query.parse(getQuery(event))
  return { items: await listEmailEndpoints(query.client_id, actor.id) }
})
