import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { leadConnectorService } from '~~/server/utils/leads/connectorService'

const Query = z.strictObject({
  clientId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid connector query' })
  }
  return { items: await leadConnectorService.list(parsed.data.clientId) }
})
