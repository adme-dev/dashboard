import { requireRole } from '~~/server/utils/auth'
import { assertGtmAccountPath, listGtmContainers } from '~~/server/utils/googleTagManagerClient'
import { reserveGtmApiQuota, resolveGtmAccessToken } from '~~/server/utils/googleTagManagerStore'

export default eventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const query = getQuery(event)
  const connectionId = String(query.connectionId || '')
  const accountPath = assertGtmAccountPath(String(query.accountPath || ''))
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  const credential = await resolveGtmAccessToken(event, connectionId)
  await reserveGtmApiQuota(1)
  const containers = await listGtmContainers(credential.token, accountPath)
  return { containers: containers.filter(container => !container.usageContext?.length || container.usageContext.includes('web')) }
})
