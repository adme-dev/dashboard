import type { SocialDashboardClient } from '../socialDashboardClient'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from '../normalize'
import type {
  FeedProvider, FeedProviderContext, DealerLink, FeedRef, CreateFeedSpec,
} from '../types'

export const SOCIAL_DASHBOARD_PROVIDER_ID = 'social-dashboard'

export function createSocialDashboardProvider(client: SocialDashboardClient): FeedProvider {
  return {
    id: SOCIAL_DASHBOARD_PROVIDER_ID,
    label: 'Social Dashboard (Vehicle Feed Platform)',

    async listFeeds(ctx, _link) {
      const r = await client.call<{ items?: any[] }>(ctx, 'GET', `/api/feeds?type=google`)
      return (r.items ?? []).map(normalizeFeedSummary)
    },

    async getFeed(ctx, ref: FeedRef) {
      const r = await client.call<{ item: any }>(ctx, 'GET', `/api/feeds/${ref.feedId}`)
      return normalizeFeedDetail(r.item)
    },

    async previewFeed(ctx, ref: FeedRef, opts) {
      const q = `?limit=${opts.limit ?? 20}&offset=${opts.offset ?? 0}`
      const r = await client.call<{ total?: number; items?: any[] }>(ctx, 'GET', `/api/feeds/${ref.feedId}/preview${q}`)
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async searchInventory(ctx, link: DealerLink, filters) {
      const r = await client.call<{ total?: number; items?: any[] }>(ctx, 'POST', `/api/feeds/search-inventory`, { sellerRefs: link.sellerRefs, filters })
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async createFeed(ctx, _link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef> {
      const r = await client.call<{ id: string }>(ctx, 'POST', `/api/feeds`, {
        name: spec.name,
        feed_type: spec.platform,
        filters: spec.filters ?? {},
        mappings: spec.mappings ?? {},
        source: spec.source,
      })
      return { providerId: SOCIAL_DASHBOARD_PROVIDER_ID, feedId: String(r.id), platform: spec.platform }
    },

    async updateFeed(ctx, ref: FeedRef, patch) {
      await client.call(ctx, 'PATCH', `/api/feeds/${ref.feedId}`, patch)
    },

    async generateFeed(ctx, ref: FeedRef, format) {
      const r = await client.call<{ url: string; itemCount: number }>(ctx, 'POST', `/api/feeds/generate`, { feedId: ref.feedId, format })
      return { url: r.url, itemCount: r.itemCount }
    },

    async getMetrics(ctx, ref: FeedRef) {
      const r = await client.call<{ inventory?: number; active?: number; issues?: number }>(ctx, 'GET', `/api/feeds/${ref.feedId}/metrics`)
      return { inventory: r.inventory ?? 0, active: r.active ?? 0, issues: r.issues ?? 0, fetchedAt: new Date().toISOString() }
    },
  }
}
