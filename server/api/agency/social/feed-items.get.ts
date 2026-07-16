/**
 * GET /api/agency/social/feed-items
 *
 * Auto Feed news stream (dealer feeds plugin, slice 1): current vehicle
 * items across every client with an active dealer-feed link, normalised
 * into cards the Paid Social "Auto Feed" page renders. Read-only — items
 * only become social posts via the compose flow, never automatically.
 *
 * Flag-gated by DEALER_FEEDS_ENABLED: when off (or the provider isn't
 * configured) returns { flagEnabled: false } so the page can show a
 * friendly state instead of erroring.
 */

import { requirePermission } from '~~/server/utils/auth'
import { cachedFetch } from '~~/server/utils/kv'
import { rowToDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { listDealerLinks } from '~~/server/utils/feeds/dealerLinkStore'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'

const MAX_CLIENTS = 8
const ITEMS_PER_CLIENT = 12

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')

  if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
    return { flagEnabled: false, items: [], clients: [] }
  }

  return cachedFetch(event, 'social-feed-items', 300, async () => {
    const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
    if (!socialDashboardClient) {
      return { flagEnabled: false, items: [], clients: [] }
    }

    const linkRecords = (await listDealerLinks()).slice(0, MAX_CLIENTS)
    const items: any[] = []
    const clients: Array<{ id: string; name: string }> = []

    for (const record of linkRecords) {
      const link = rowToDealerLink(record)
      const clientName = (record as any).client_name || (record as any).clientName || link.clientId
      clients.push({ id: link.clientId, name: clientName })
      try {
        const provider = getFeedProvider(link.providerId, { socialDashboardClient })
        const ctx = linkToContext(link, user.email)
        const feeds = (await provider.listFeeds(ctx, link)).filter(f => f.isActive)
        const feed = feeds[0]
        if (!feed) continue
        const preview = await provider.previewFeed(ctx, link, { feedId: feed.id } as any, { limit: ITEMS_PER_CLIENT })
        for (const v of preview.items) {
          items.push({
            id: `${link.clientId}:${v.id}`,
            clientId: link.clientId,
            clientName,
            feedName: feed.name,
            eventType: v.condition && /new/i.test(v.condition) ? 'new' : 'listing',
            title: [v.year, v.make, v.model].filter(Boolean).join(' ') || v.stockNumber || 'Vehicle',
            price: v.price,
            condition: v.condition,
            stockNumber: v.stockNumber,
            url: v.url,
            imageUrl: v.image,
          })
        }
      } catch (err: any) {
        // One client's feed being down must not blank the whole stream.
        console.warn('[feed-items] failed for client', link.clientId, err?.message)
      }
    }

    return { flagEnabled: true, items, clients }
  })
})
