import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { listCrmLeadInboxRoutes } from '~~/server/utils/crm/emailRouteManagement'
import { PERMISSIONS } from '~~/server/utils/permissions'

const Query = z.object({
  client_id: z.string().uuid()
}).strict()

export default defineEventHandler(async (event) => {
  if ((event.context as { clientPortalUser?: unknown }).clientPortalUser) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  await requireRole(event, PERMISSIONS.CLIENTS)
  const query = Query.parse(getQuery(event))

  return { items: await listCrmLeadInboxRoutes({ clientId: query.client_id }) }
})
