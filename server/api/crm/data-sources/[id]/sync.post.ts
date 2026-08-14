import { PERMISSIONS } from '~~/server/utils/permissions'
import { enqueueMerchantCatalogReconciliationForSource } from '~~/server/utils/crm/catalogMerchantDispatch'
import { synchronizeCatalogSource } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  const sourceId = getRouterParam(event, 'id')
  const body = await readBody<Record<string, unknown>>(event)
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!clientId || !sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'client_id and source ID are required' })
  }
  const result = await synchronizeCatalogSource(event, clientId, sourceId, user.email)
  await enqueueMerchantCatalogReconciliationForSource(event, { clientId, sourceId })
  return result
})
