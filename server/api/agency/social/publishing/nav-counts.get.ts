import { requireAuth } from '~~/server/utils/auth'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { getSocialPublishingNavCounts } from '~~/server/utils/socialPublishingNavCounts'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/nav-counts?clientId=
 * Live counts for the publishing suite tile-nav badges
 * ({ accounts, scheduled, pendingApprovals, drafts, campaigns }). clientId optional.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  const user = await requireAuth(event)
  const department = user.permissionGroups?.includes('MARKETING_MANAGEMENT') === true
  if (department && !await hasFreshMarketingManagementPermission(user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Current marketing permission required' })
  }
  if (clientId || !department) await requireSocialClientScope(event, clientId)
  return await getSocialPublishingNavCounts(clientId || null, department)
})
