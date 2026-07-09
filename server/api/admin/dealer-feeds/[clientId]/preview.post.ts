import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { FeedPlatform } from '~~/server/utils/feeds/types'

function parsePlatform(value: unknown): FeedPlatform {
  if (value === 'google' || value === 'facebook') return value
  throw createError({ statusCode: 400, statusMessage: 'platform must be google or facebook' })
}

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function optionalBodyObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = bodyObject(value)
  return Object.keys(parsed).length ? parsed : undefined
}

function parseBoundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

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

  const body = bodyObject(await readBody(event))
  const provider = getFeedProvider(link.providerId, { socialDashboardClient })
  const preview = await provider.previewInventory(
    linkToContext(link, user.email),
    link,
    {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      platform: parsePlatform(body.platform),
      filters: normalizeDealerFeedFilters(body.filters),
      mappings: bodyObject(body.mappings),
      platformSettings: bodyObject(body.platformSettings),
      source: optionalBodyObject(body.source)
    },
    {
      limit: parseBoundedInt(body.limit, 12, 50),
      offset: 0
    }
  )

  return {
    ok: true,
    preview: {
      total: preview.total,
      items: preview.items,
      ...(preview.validation ? { validation: preview.validation } : {}),
      readiness: summarizeFeedReadiness(preview.validation)
    }
  }
})
