import { requireClientCrmAccess } from '~~/server/utils/crm/clientCrmAccess'
import { listCrmLeadInboxRoutes } from '~~/server/utils/crm/emailRouteManagement'

export default defineEventHandler(async (event) => {
  const client = await requireClientCrmAccess(event, 'view')

  return {
    items: await listCrmLeadInboxRoutes({
      clientId: client.clientId,
      includeClientId: false
    })
  }
})
