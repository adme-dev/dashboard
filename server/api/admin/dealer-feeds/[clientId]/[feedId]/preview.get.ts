import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { FeedPlatform } from '~~/server/utils/feeds/types'

function parsePlatform(value: unknown): FeedPlatform {
  if (value === 'facebook') return 'facebook'
  return 'google'
}

function parseBoundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown preview error')
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
  if (!socialDashboardClient) {
    throw createError({ statusCode: 503, statusMessage: 'Social Dashboard feed provider is not configured' })
  }

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  let preview
  try {
    preview = await provider.previewFeed(
      linkToContext(link, user.email),
      link,
      {
        providerId: link.providerId,
        feedId,
        platform: parsePlatform(query.platform)
      },
      {
        limit: parseBoundedInt(query.limit, 20, 100),
        offset: parseBoundedInt(query.offset, 0, 10000),
        search
      }
    )
  } catch (error) {
    const message = providerErrorMessage(error)
    console.error('[dealer-feeds/preview] Provider preview failed', {
      clientId,
      feedId,
      providerId: link.providerId,
      externalOrgId: link.externalOrgId,
      sellerRefs: link.sellerRefs,
      message
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Dealer feed preview failed',
      data: { message }
    })
  }

  return { ok: true, preview }
})
