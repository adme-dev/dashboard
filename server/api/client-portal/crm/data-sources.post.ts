import { requireClientCatalogAccess } from '~~/server/utils/crm/clientCatalogAccess'
import { createCatalogSourceForClient } from '~~/server/utils/crm/catalogSourceService'

export default defineEventHandler(async event => {
  const client = await requireClientCatalogAccess(event, true)
  const source = await createCatalogSourceForClient(
    client.clientId,
    client.id,
    await readBody<Record<string, unknown>>(event)
  )
  setResponseStatus(event, 201)
  return { source }
})
