import { getSocialPublishingNavCounts } from '~~/server/utils/socialPublishingNavCounts'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/nav-counts?clientId=
 * Live counts for the publishing suite tile-nav badges
 * ({ accounts, scheduled, pendingApprovals, drafts, campaigns }). clientId optional.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  await requireSocialClientScope(event, clientId)
  return await getSocialPublishingNavCounts(clientId || null)
})
