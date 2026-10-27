import { requireAuth } from '~~/server/utils/auth'
import { executeReviewedGoogleAdsPlan } from '~~/server/utils/googleAds/staffReview'
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  return executeReviewedGoogleAdsPlan(event, user.id, {
    ...body,
    actionPlanId: id
  })
})
