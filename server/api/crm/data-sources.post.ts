import { PERMISSIONS } from '~~/server/utils/permissions'
import { createCatalogSourceForClient } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async event => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  const body = await readBody<Record<string, unknown>>(event)
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  const source = await createCatalogSourceForClient(clientId, user.id, body)
  setResponseStatus(event, 201)
  return { source }
})
