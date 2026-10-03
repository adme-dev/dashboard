import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listLiveReviews } from '~~/server/utils/socialPublishing/liveReviews'

export default defineEventHandler(async (event) => {
  const user = await requireClientAuth(event)
  if (!user.permissions.canApproveWork) throw createError({ statusCode: 403, statusMessage: 'Approval access required' })
  return listLiveReviews(user.clientId)
})
