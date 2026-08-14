import { requireClientCatalogAccess } from '~~/server/utils/crm/clientCatalogAccess'
import { enqueueMerchantCatalogReconciliationForSource } from '~~/server/utils/crm/catalogMerchantDispatch'
import { synchronizeCatalogSource } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async (event) => {
  const client = await requireClientCatalogAccess(event, true)
  const sourceId = getRouterParam(event, 'id')
  if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Source ID is required' })
  const result = await synchronizeCatalogSource(event, client.clientId, sourceId, client.email)
  await enqueueMerchantCatalogReconciliationForSource(event, { clientId: client.clientId, sourceId })
  return result
})
