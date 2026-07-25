import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getClientPlatformRolloutReadiness } from '~~/server/utils/crm/platformRolloutReadiness'

export default defineEventHandler(async event => {
  await requirePermission(event, 'CLIENTS')
  setHeader(event, 'Cache-Control', 'private, no-store')
  const clientId = getRouterParam(event, 'id')
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid client ID is required' })
  }
  const client = await queryOne<{ id: string }>(
    'SELECT id FROM agency_clients WHERE id = $1',
    [clientId]
  )
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  return getClientPlatformRolloutReadiness(clientId)
})
