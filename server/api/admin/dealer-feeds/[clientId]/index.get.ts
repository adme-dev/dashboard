import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
  }

  const link = await getDealerLink(clientId)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Dealer feed link not found for client' })

  const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
  if (!socialDashboardClient) {
    throw createError({ statusCode: 503, statusMessage: 'Social Dashboard feed provider is not configured' })
  }

  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const feeds = await provider.listFeeds(linkToContext(link, user.email), link)
  return { ok: true, link, feeds }
})
