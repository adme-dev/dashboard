import { requireRole } from '~~/server/utils/auth'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { rollbackGtmChangeSet } from '~~/server/utils/googleTagManagerInstaller'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const siteId = getRouterParam(event, 'siteId')
  const changeSetId = getRouterParam(event, 'changeSetId')
  await requireSiteTrackingAccess(event, siteId)
  const body = await readBody<{ confirmed?: boolean }>(event)
  if (body?.confirmed !== true) throw createError({ statusCode: 400, statusMessage: 'Explicit confirmation is required' })
  if (!changeSetId) throw createError({ statusCode: 400, statusMessage: 'changeSetId is required' })
  return await rollbackGtmChangeSet(event, { siteId: siteId!, changeSetId, userId: user.id })
})
