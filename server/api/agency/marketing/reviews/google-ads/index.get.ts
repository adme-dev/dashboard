import { requireAuth } from '~~/server/utils/auth'
import { listGoogleAdsReviewPlans } from '~~/server/utils/googleAds/staffReview'
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return listGoogleAdsReviewPlans(event, user.id)
})
