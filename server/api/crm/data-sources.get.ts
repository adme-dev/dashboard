import { PERMISSIONS } from '~~/server/utils/permissions'
import { listCatalogSources } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async event => {
  await requireRole(event, PERMISSIONS.CLIENTS)
  const clientId = String(getQuery(event).client_id || '')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  return listCatalogSources(clientId)
})
