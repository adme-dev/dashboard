import { requireRole } from '~~/server/utils/auth'
import { listGtmAccounts } from '~~/server/utils/googleTagManagerClient'
import { reserveGtmApiQuota, resolveGtmAccessToken } from '~~/server/utils/googleTagManagerStore'

export default eventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const connectionId = String(getQuery(event).connectionId || '')
  if (!connectionId) throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  const credential = await resolveGtmAccessToken(event, connectionId)
  await reserveGtmApiQuota(1)
  return { accounts: await listGtmAccounts(credential.token) }
})
