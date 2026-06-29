import type { SocialDashboardClient } from '../socialDashboardClient'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from './socialDashboardNormalize'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from '../constants'
import type {
  FeedProvider, FeedProviderContext, DealerLink, FeedRef, CreateFeedSpec, FeedMetrics,
} from '../types'

function assertOrgMatch(ctx: FeedProviderContext, link: DealerLink) {
  if (ctx.externalOrgId !== link.externalOrgId) {
    throw new Error(`feed org mismatch: context org "${ctx.externalOrgId}" != link org "${link.externalOrgId}"`)
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map(s => s.trim()).filter(Boolean)
    : []
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(String).map(s => s.trim()).filter(Boolean)))
}

function noMatchingSellerId(): string {
  return '__no_matching_seller__'
}

export function buildInventoryPreviewFilters(filters: Record<string, unknown>, sellerRefs: string[]): Record<string, unknown> {
  const allowed = uniqueStrings(sellerRefs)
  const input = filters && typeof filters === 'object' ? filters : {}
  const base: Record<string, unknown> = { ...input }

  if (!allowed.length) return base

  const allowedSet = new Set(allowed)
  const rulesets = Array.isArray((base as any).rulesets) ? (base as any).rulesets : null
  if (rulesets) {
    const scopedRulesets = rulesets.flatMap((rule: any, idx: number) => {
      const currentSeller = String(rule?.sellerId ?? '').trim()
      if (currentSeller) return allowedSet.has(currentSeller) ? [{ ...rule }] : []
      return allowed.map((sellerId) => ({
        ...rule,
        id: `${String(rule?.id ?? `ruleset-${idx}`)}:${sellerId}`,
        sellerId,
      }))
    })

    return {
      ...base,
      rulesets: scopedRulesets.length
        ? scopedRulesets
        : [{ id: 'no-matching-seller', sellerId: noMatchingSellerId() }],
      manualIncludeIds: undefined,
    }
  }

  const requested = uniqueStrings([
    ...strings((base as any).sellerIds),
    ...strings((base as any).dealerIds),
  ])
  const scopedSellerIds = requested.length ? requested.filter(id => allowedSet.has(id)) : allowed
  delete base.dealerIds
  delete base.selectionMode

  return {
    ...base,
    sellerIds: scopedSellerIds.length ? scopedSellerIds : [noMatchingSellerId()],
  }
}

function orgQuery(ctx: FeedProviderContext): string {
  return `?${new URLSearchParams({ orgId: ctx.externalOrgId }).toString()}`
}

function normalizeGenerateResult(raw: any): { url: string; itemCount: number } {
  const meta = raw?.meta && typeof raw.meta === 'object' ? raw.meta : raw
  return {
    url: String(meta?.url ?? ''),
    itemCount: Number(meta?.itemCount ?? meta?.item_count ?? 0),
  }
}

function normalizeMetricsResult(raw: any): FeedMetrics {
  const vehicleStats = raw?.vehicleStats && typeof raw.vehicleStats === 'object' ? raw.vehicleStats : null
  const inventory = Number(raw?.inventory ?? vehicleStats?.forSaleNow ?? 0)
  return {
    inventory: Number.isFinite(inventory) ? inventory : 0,
    active: Number(raw?.active ?? inventory ?? 0) || 0,
    issues: Number(raw?.issues ?? 0) || 0,
    fetchedAt: new Date().toISOString(),
  }
}

export function createSocialDashboardProvider(client: SocialDashboardClient): FeedProvider {
  return {
    id: SOCIAL_DASHBOARD_PROVIDER_ID,
    label: 'Social Dashboard (Vehicle Feed Platform)',

    async listFeeds(ctx, link) {
      assertOrgMatch(ctx, link)
      const r = await client.call<{ items?: any[] }>(ctx, 'GET', `/api/feeds${orgQuery(ctx)}`)
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
      assertOrgMatch(ctx, link)
      const r = await client.call<{ total?: number; items?: any[] }>(ctx, 'POST', `/api/feeds/preview`, {
        filters: buildInventoryPreviewFilters(filters, link.sellerRefs),
        limit: 100,
        offset: 0,
      })
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async createFeed(ctx, link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef> {
      assertOrgMatch(ctx, link)
      const r = await client.call<{ id: string }>(ctx, 'POST', `/api/feeds`, {
        name: spec.name,
        feed_type: spec.platform,
        organization_id: link.externalOrgId,
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
      const r = await client.call(ctx, 'POST', `/api/feeds/generate`, { feedId: ref.feedId, format })
      return normalizeGenerateResult(r)
    },

    async getMetrics(ctx, ref: FeedRef) {
      const r = await client.call(ctx, 'GET', `/api/feeds/${ref.feedId}/metrics`)
      return normalizeMetricsResult(r)
    },
  }
}
