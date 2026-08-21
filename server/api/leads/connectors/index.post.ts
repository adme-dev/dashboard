import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { leadConnectorService } from '~~/server/utils/leads/connectorService'

export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  await requireWriteAccess(event)
  const result = await leadConnectorService.create(await readBody(event), actor.id)
  setResponseStatus(event, 201)
  return result
})
