import { requireRole } from '~~/server/utils/auth'
import { getDealerLink } from '~~/server/utils/feeds/dealerLinks'
import { isDealerFeedsEnabled, loadSocialDashboardConfig } from '~~/server/utils/feeds/config'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { buildSocialDashboardFeedServeUrl } from '~~/server/utils/feeds/socialDashboardClient'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const clientId = event.context.params?.clientId
  const feedId = event.context.params?.feedId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })
  if (!feedId) throw createError({ statusCode: 400, statusMessage: 'feedId is required' })

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
  }

  const link = await getDealerLink(clientId)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Dealer feed link not found for client' })

  const cfg = await loadSocialDashboardConfig({ runtimeEnv: cloudflareRuntimeEnv(event) })
  if (!cfg) {
    throw createError({ statusCode: 503, statusMessage: 'Social Dashboard feed provider is not configured' })
  }

  return {
    ok: true,
    generated: {
      url: buildSocialDashboardFeedServeUrl(cfg.baseUrl, feedId),
      itemCount: 0,
      format: 'xml'
    }
  }
})
