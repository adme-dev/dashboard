import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled, resolveSocialDashboardBaseUrl } from '~~/server/utils/feeds/config'
import { buildInventoryPreviewFilters } from '~~/server/utils/feeds/providers/socialDashboard'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { buildSocialDashboardFeedServeUrl } from '~~/server/utils/feeds/socialDashboardClient'

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const clientId = event.context.params?.clientId
  const feedId = event.context.params?.feedId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  if (!feedId) throw createError({ statusCode: 400, statusMessage: 'feedId is required' })

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
  }

  const link = await getDealerLink(clientId)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Dealer feed link not found for client' })

  const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
  if (socialDashboardClient && link.sellerRefs.length) {
    const provider = getFeedProvider(link.providerId, { socialDashboardClient })
    const ctx = linkToContext(link, user.email)
    const feed = await provider.getFeed(ctx, { providerId: link.providerId, feedId, platform: 'google' })
    const scopedFilters = buildInventoryPreviewFilters(feed.filters, link.sellerRefs)
    if (!sameJson(feed.filters, scopedFilters)) {
      await provider.updateFeed(ctx, { providerId: link.providerId, feedId, platform: feed.platform }, { filters: scopedFilters })
    }
  }

  const baseUrl = await resolveSocialDashboardBaseUrl({ runtimeEnv: cloudflareRuntimeEnv(event) })

  return {
    ok: true,
    generated: {
      url: buildSocialDashboardFeedServeUrl(baseUrl, feedId),
      itemCount: 0,
      format: 'xml'
    }
  }
})
