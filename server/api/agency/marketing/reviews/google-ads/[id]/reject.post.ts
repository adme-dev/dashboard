import { requireAuth } from '~~/server/utils/auth'
import { reviewGoogleAdsPlan } from '~~/server/utils/googleAds/staffReview'
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  return reviewGoogleAdsPlan(event, user.id, {
    ...body,
    actionPlanId: id,
    decision: 'rejected'
  })
})
