import { requireAuth } from '~~/server/utils/auth'
import { getSocialPublishingNavCounts } from '~~/server/utils/socialPublishingNavCounts'

/**
 * GET /api/agency/social/publishing/nav-counts?clientId=
 * Live counts for the publishing suite tile-nav badges
 * ({ accounts, scheduled, pendingApprovals, drafts }). clientId optional.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string | undefined
  return await getSocialPublishingNavCounts(clientId || null)
})
