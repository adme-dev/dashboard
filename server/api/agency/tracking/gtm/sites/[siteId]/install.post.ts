import { requireRole } from '~~/server/utils/auth'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { installXeroFlowViaGtm } from '~~/server/utils/googleTagManagerInstaller'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const siteId = getRouterParam(event, 'siteId')
  await requireSiteTrackingAccess(event, siteId)
  const body = await readBody<{ confirmed?: boolean, publish?: boolean }>(event)
  if (body?.confirmed !== true) {
    throw createError({ statusCode: 400, statusMessage: 'Explicit confirmation is required' })
  }
  return await installXeroFlowViaGtm(event, {
    siteId: siteId!,
    userId: user.id,
    publish: body.publish === true,
  })
})
