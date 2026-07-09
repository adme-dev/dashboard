import { requireRole } from '~~/server/utils/auth'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { normalizeDealerFeedFilters } from '~~/server/utils/feeds/filterInput'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
  const preview = await provider.searchInventory(
    linkToContext(link, user.email),
    link,
    normalizeDealerFeedFilters(body.filters)
  )

  const limit = parseBoundedInt(body.limit, 12, 50)
  return {
    ok: true,
    preview: {
      total: preview.total,
      items: preview.items.slice(0, limit)
    }
  }
})
