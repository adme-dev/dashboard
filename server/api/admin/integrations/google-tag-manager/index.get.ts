import { requireRole } from '~~/server/utils/auth'
import { getGtmAdminOverview } from '~~/server/utils/googleTagManagerAdmin'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  return await getGtmAdminOverview(event)
})
