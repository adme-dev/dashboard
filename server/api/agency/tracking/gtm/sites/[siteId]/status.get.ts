import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { getGtmSiteStatus } from '~~/server/utils/googleTagManagerInstaller'

export default eventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  await requireSiteTrackingAccess(event, siteId)
  return await getGtmSiteStatus(event, siteId!)
})
