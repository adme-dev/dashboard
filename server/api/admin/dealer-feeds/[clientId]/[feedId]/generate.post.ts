import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { FeedPlatform } from '~~/server/utils/feeds/types'

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parsePlatform(value: unknown): FeedPlatform {
  if (value === 'facebook') return 'facebook'
  return 'google'
}

function parseFormat(value: unknown): 'xml' | 'csv' {
  if (value === 'csv') return 'csv'
  return 'xml'
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

  const body = bodyObject(await readBody(event))
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const generated = await provider.generateFeed(
    linkToContext(link, user.email),
    {
      providerId: link.providerId,
      feedId,
      platform: parsePlatform(body.platform)
    },
    parseFormat(body.format)
  )

  if (!generated.url) {
    throw createError({ statusCode: 502, statusMessage: 'Feed generated without a share URL' })
  }

  return { ok: true, generated }
})
