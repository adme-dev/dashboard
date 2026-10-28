import {
  requireDealerFeedAccess,
  requireDealerFeedResource,
  dealerFeedRuntimeEnv
} from '~~/server/utils/feeds/departmentAccess'
import { queryOneFresh } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  isDealerFeedsEnabled
} from '~~/server/utils/feeds/config'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import { getFeedProvider } from '~~/server/utils/feeds/registry'

function parseBoundedInt(
  value: unknown,
  fallback: number,
  max: number
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

export default defineEventHandler(async (event) => {
  const clientId = event.context.params?.clientId
  const feedId = event.context.params?.feedId
  if (!clientId)
    throw createError({
      statusCode: 400,
      statusMessage: 'clientId is required'
    })
  const { user } = await requireDealerFeedAccess(event, clientId, false)
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
  if (!socialDashboardClient) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Social Dashboard feed provider is not configured'
    })
  }

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const detail = await requireDealerFeedResource(
    provider,
    linkToContext(link, user.email),
    link,
    feedId
  )
  let preview
  try {
    preview = await provider.previewFeed(
      linkToContext(link, user.email),
      link,
      {
        providerId: link.providerId,
        feedId,
        platform: detail.platform
      },
      {
        limit: parseBoundedInt(query.limit, 20, 100),
        offset: parseBoundedInt(query.offset, 0, 10000),
        search
      }
    )
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Dealer feed preview failed'
    })
  }

  return {
    ok: true,
    preview: {
      ...preview,
      readiness: summarizeFeedReadiness(preview.validation)
    }
  }
})
