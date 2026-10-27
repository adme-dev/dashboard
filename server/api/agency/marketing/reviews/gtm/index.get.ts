import { requireAuth } from '~~/server/utils/auth'
import { listGtmReviewProposals } from '~~/server/utils/tracking/gtmProposals'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return listGtmReviewProposals({ event, userId: user.id, userRole: user.role })
})
