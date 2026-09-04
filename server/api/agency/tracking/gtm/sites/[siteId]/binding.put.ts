import { requireRole } from '~~/server/utils/auth'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { listGtmAccounts, listGtmContainers } from '~~/server/utils/googleTagManagerClient'
import { upsertGtmContainerBinding } from '~~/server/utils/googleTagManagerInstaller'
import { reserveGtmApiQuota, resolveGtmAccessToken } from '~~/server/utils/googleTagManagerStore'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const siteId = getRouterParam(event, 'siteId')
  await requireSiteTrackingAccess(event, siteId)
  const body = await readBody<{
    connectionId?: string
    accountPath?: string
    containerPath?: string
  }>(event)
  if (!body?.connectionId || !body.accountPath || !body.containerPath) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId, accountPath and containerPath are required' })
  }
  const credential = await resolveGtmAccessToken(event, body.connectionId)
  await reserveGtmApiQuota(2)
  const accounts = await listGtmAccounts(credential.token)
  const account = accounts.find(item => item.path === body.accountPath)
  if (!account) throw createError({ statusCode: 403, statusMessage: 'Selected GTM account is not accessible' })
  const containers = await listGtmContainers(credential.token, account.path)
  const container = containers.find(item => item.path === body.containerPath)
  if (!container) throw createError({ statusCode: 403, statusMessage: 'Selected GTM container is not accessible' })
  const binding = await upsertGtmContainerBinding({
    siteId: siteId!,
    userId: user.id,
    connectionId: body.connectionId,
    account: { path: account.path, name: account.name },
    container,
  })
  return { binding }
})
