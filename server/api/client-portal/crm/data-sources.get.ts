import { requireClientCatalogAccess } from '~~/server/utils/crm/clientCatalogAccess'
import { listCatalogSources } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async event => {
  const client = await requireClientCatalogAccess(event)
  return listCatalogSources(client.clientId)
})
