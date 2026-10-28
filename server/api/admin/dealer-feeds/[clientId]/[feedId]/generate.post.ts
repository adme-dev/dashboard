import {
  requireDealerFeedAccess,
  requireDealerFeedResource,
  dealerFeedRuntimeEnv
} from '~~/server/utils/feeds/departmentAccess'
import { queryOneFresh } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  isDealerFeedsEnabled,
  resolveSocialDashboardBaseUrl
} from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { buildSocialDashboardFeedServeUrl } from '~~/server/utils/feeds/socialDashboardClient'

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  const feedId = event.context.params?.feedId
  if (!clientId)
    throw createError({
      statusCode: 400,
      statusMessage: 'clientId is required'
    })
  const { user } = await requireDealerFeedAccess(event, clientId, true)
  if (!feedId)
    throw createError({ statusCode: 400, statusMessage: 'feedId is required' })

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
  if (!socialDashboardClient)
    throw createError({
      statusCode: 503,
      statusMessage: 'Feed provider is not configured'
    })
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const detail = await requireDealerFeedResource(
    provider,
    linkToContext(link, user.email),
    link,
    feedId
  )

  const baseUrl = await resolveSocialDashboardBaseUrl({
    env: dealerFeedRuntimeEnv(event),
    runtimeEnv: dealerFeedRuntimeEnv(event),
    queryOne: queryOneFresh
  })

  const preview = await provider.previewFeed(
    linkToContext(link, user.email),
    link,
    { providerId: link.providerId, feedId, platform: detail.platform },
    { limit: 1 }
  )

  return {
    ok: true,
    generated: {
      url: buildSocialDashboardFeedServeUrl(baseUrl, feedId),
      itemCount: preview.validation?.validatedTotal ?? null,
      format: 'xml'
    }
  }
})
