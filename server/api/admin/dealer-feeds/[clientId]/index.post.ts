import {
  requireDealerFeedAccess,
  executeDepartmentBrowserFeedCreation,
  requireDealerFeedResource,
  dealerFeedRuntimeEnv
} from '~~/server/utils/feeds/departmentAccess'
import { queryOneFresh } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  isDealerFeedsEnabled
} from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import { executeGodModeDealerFeedCreation } from '~~/server/utils/feeds/godModeMutations'
import { buildInventoryPreviewFilters } from '~~/server/utils/feeds/providers/socialDashboard'
import type { FeedPlatform } from '~~/server/utils/feeds/types'

function parsePlatform(value: unknown): FeedPlatform {
  if (value === 'google' || value === 'facebook') return value
  throw createError({
    statusCode: 400,
    statusMessage: 'platform must be google or facebook'
  })
}

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  if (!clientId)
    throw createError({
      statusCode: 400,
      statusMessage: 'clientId is required'
    })
  const { user, admin } = await requireDealerFeedAccess(event, clientId, true)

  if (!isDealerFeedsEnabled(dealerFeedRuntimeEnv(event))) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Dealer feeds are not enabled'
    })
  }

  const body = bodyObject(await readBody(event))
  if (
    !admin
    && (body.source
      || body.externalKey
      || body.externalClientId
      || body.externalFeedId
      || body.externalCampaignId
      || Object.keys(bodyObject(body.mappings)).length
      || Object.keys(bodyObject(body.platformSettings)).some(
        key => key !== 'store_code'
      ))
  ) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'Supplier configuration changes require verified provider ownership'
    })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name)
    throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const link = await getDealerLink(clientId, undefined, {
    queryOne: queryOneFresh
  })
  if (!link || !link.sellerRefs.length)
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

  const platform = parsePlatform(body.platform)
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const providerContext = linkToContext(link, user.email)
  const spec = {
    name,
    platform,
    filters: buildInventoryPreviewFilters(
      normalizeDealerFeedFilters(body.filters),
      link.sellerRefs
    ),
    mappings: bodyObject(body.mappings),
    platformSettings: bodyObject(body.platformSettings),
    source:
      body.source
      && typeof body.source === 'object'
      && !Array.isArray(body.source)
        ? (body.source as Record<string, unknown>)
        : undefined,
    externalKey:
      typeof body.externalKey === 'string' ? body.externalKey : undefined,
    externalClientId:
      typeof body.externalClientId === 'string'
        ? body.externalClientId
        : undefined,
    externalCampaignId:
      typeof body.externalCampaignId === 'string'
        ? body.externalCampaignId
        : undefined,
    externalFeedId:
      typeof body.externalFeedId === 'string' ? body.externalFeedId : undefined
  }
  const create = async () => {
    const currentLink = await getDealerLink(clientId, undefined, {
      queryOne: queryOneFresh
    })
    if (JSON.stringify(currentLink) !== JSON.stringify(link))
      throw createError({
        statusCode: 409,
        statusMessage: 'Dealer mapping changed; review before retrying'
      })
    const feed = await provider.createFeed(providerContext, link, spec)
    await requireDealerFeedResource(
      provider,
      providerContext,
      link,
      feed.feedId
    )
    return feed
  }
  const feed = admin
    ? await executeGodModeDealerFeedCreation(event, create, async (feedId) => {
        await provider.getFeed(providerContext, {
          providerId: link.providerId,
          feedId,
          platform
        })
        return { providerId: link.providerId, feedId, platform }
      })
    : await executeDepartmentBrowserFeedCreation(event, clientId, spec, create)

  return { ok: true, feed }
})
