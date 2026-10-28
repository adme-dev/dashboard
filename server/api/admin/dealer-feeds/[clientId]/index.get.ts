import {
  requireDealerFeedAccess,
  isDealerFeedSellerScoped,
  dealerFeedRuntimeEnv
} from '~~/server/utils/feeds/departmentAccess'
import { queryOneFresh } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  isDealerFeedsEnabled
} from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId)
    throw createError({
      statusCode: 400,
      statusMessage: 'clientId is required'
    })
  const { user } = await requireDealerFeedAccess(event, clientId, false)

  if (!isDealerFeedsEnabled(dealerFeedRuntimeEnv(event))) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Dealer feeds are not enabled'
    })
  }

  const link = await getDealerLink(clientId, undefined, {
    queryOne: queryOneFresh
  })
  if (!link)
    throw createError({
      statusCode: 404,
      statusMessage: 'Dealer feed link not found for client'
    })

  const socialDashboardClient = await getSocialDashboardClient({
    env: dealerFeedRuntimeEnv(event),
    runtimeEnv: dealerFeedRuntimeEnv(event),
    queryOne: queryOneFresh
  })
  if (!socialDashboardClient) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Social Dashboard feed provider is not configured'
    })
  }

  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const providerContext = linkToContext(link, user.email)
  const candidates = await provider.listFeeds(providerContext, link)
  const feeds = []
  for (const candidate of candidates) {
    const detail = await provider.getFeed(providerContext, {
      providerId: link.providerId,
      feedId: candidate.id,
      platform: candidate.platform
    })
    if (isDealerFeedSellerScoped(detail, link)) feeds.push(candidate)
  }
  return { ok: true, link, feeds }
})
