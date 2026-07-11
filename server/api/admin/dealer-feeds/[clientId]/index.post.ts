import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import type { FeedPlatform } from '~~/server/utils/feeds/types'

function parsePlatform(value: unknown): FeedPlatform {
  if (value === 'google' || value === 'facebook') return value
  throw createError({ statusCode: 400, statusMessage: 'platform must be google or facebook' })
}

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const clientId = event.context.params?.clientId
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId is required' })

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
  }

  const body = bodyObject(await readBody(event))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const link = await getDealerLink(clientId)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Dealer feed link not found for client' })

  const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
  if (!socialDashboardClient) {
    throw createError({ statusCode: 503, statusMessage: 'Social Dashboard feed provider is not configured' })
  }

  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const feed = await provider.createFeed(linkToContext(link, user.email), link, {
    name,
    platform: parsePlatform(body.platform),
    filters: normalizeDealerFeedFilters(body.filters),
    mappings: bodyObject(body.mappings),
    platformSettings: bodyObject(body.platformSettings),
    source: body.source && typeof body.source === 'object' && !Array.isArray(body.source) ? body.source as Record<string, unknown> : undefined,
    externalKey: typeof body.externalKey === 'string' ? body.externalKey : undefined,
    externalClientId: typeof body.externalClientId === 'string' ? body.externalClientId : undefined,
    externalCampaignId: typeof body.externalCampaignId === 'string' ? body.externalCampaignId : undefined,
    externalFeedId: typeof body.externalFeedId === 'string' ? body.externalFeedId : undefined
  })

  return { ok: true, feed }
})
