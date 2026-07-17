/**
 * GET /api/agency/social/feed-items
 *
 * Auto Feed news stream (dealer feeds plugin, slice 1): current vehicle
 * items for one explicitly authorized client, normalized into cards the
 * Paid Social "Auto Feed" page renders. Read-only — items only become
 * social posts via the compose flow, never automatically.
 *
 * Flag-gated by DEALER_FEEDS_ENABLED: when off (or the provider isn't
 * configured) returns { flagEnabled: false } so the page can show a
 * friendly state instead of erroring.
 */

import { requirePermission } from '~~/server/utils/auth'
import { cachedFetch } from '~~/server/utils/kv'
import { linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { listDealerLinks, type DealerLinkRecord } from '~~/server/utils/feeds/dealerLinkStore'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { loadAutoFeedInventory } from '~~/server/utils/feeds/autoFeedInventory'
import { autoFeedEventType, missingAutoFeedContentFields } from '~~/server/utils/feeds/autoFeedContent'
import { summarizeFeedReadiness } from '~~/server/utils/feeds/readiness'
import type { DealerLink, FeedReadinessSummary } from '~~/server/utils/feeds/types'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const ITEMS_PER_CLIENT = 12
const CACHE_CONTRACT_VERSION = 'v2'
const SAFE_PROVIDER_ERROR = 'Inventory could not be loaded. Try refreshing, then contact support if it continues.'

type ClientFeedStatus = 'unknown' | 'empty' | 'ready' | 'partial' | 'blocked' | 'error'

interface ClientFeedSummary {
  id: string
  name: string
  status: ClientFeedStatus
  feedName?: string
  total?: number
  readiness?: FeedReadinessSummary
  error?: string
}

interface AutoFeedItem {
  id: string
  clientId: string
  clientName: string
  feedName: string
  eventType: 'new' | 'listing'
  title: string
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  imageUrl: string | null
  missingFields: string[]
  readyForCompose: boolean
}

function recordToDealerLink(record: DealerLinkRecord): DealerLink {
  return {
    clientId: record.clientId,
    providerId: record.providerId,
    externalOrgId: record.externalOrgId,
    sellerRefs: record.sellerRefs,
    defaultFeedIds: record.defaultFeedIds
  }
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId.trim() : undefined
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    return { flagEnabled: false, items: [], clients: [] }
  }

  return cachedFetch(event, `social-feed-items:${CACHE_CONTRACT_VERSION}:${clientId}`, 300, async () => {
    const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
    if (!socialDashboardClient) {
      return { flagEnabled: false, items: [], clients: [] }
    }

    const linkRecords = await listDealerLinks({ clientId })
    const items: AutoFeedItem[] = []
    const clients: ClientFeedSummary[] = []

    for (const record of linkRecords) {
      const link = recordToDealerLink(record)
      const clientName = record.clientName || link.clientId
      try {
        const provider = getFeedProvider(link.providerId, { socialDashboardClient })
        const ctx = linkToContext(link, user.email)
        const { feedName, preview } = await loadAutoFeedInventory(provider, ctx, link, ITEMS_PER_CLIENT)
        const readiness = preview.readiness ?? summarizeFeedReadiness(preview.validation)
        const status: ClientFeedStatus = readiness.status === 'unknown' && preview.total === 0
          ? 'empty'
          : readiness.status
        clients.push({
          id: link.clientId,
          name: clientName,
          status,
          feedName,
          total: preview.total,
          readiness
        })
        for (const v of preview.items) {
          const missingFields = missingAutoFeedContentFields(v)
          items.push({
            id: `${link.clientId}:${v.id}`,
            clientId: link.clientId,
            clientName,
            feedName,
            eventType: autoFeedEventType(v),
            title: [v.year, v.make, v.model].filter(Boolean).join(' ') || v.stockNumber || 'Vehicle',
            price: v.price,
            condition: v.condition,
            stockNumber: v.stockNumber,
            url: v.url,
            imageUrl: v.image,
            missingFields,
            readyForCompose: missingFields.length === 0
          })
        }
      } catch (error: unknown) {
        clients.push({ id: link.clientId, name: clientName, status: 'error', error: SAFE_PROVIDER_ERROR })
        console.warn('[feed-items] provider request failed', {
          clientId: link.clientId,
          errorType: error instanceof Error ? error.name : typeof error
        })
      }
    }

    return { flagEnabled: true, items, clients }
  })
})
