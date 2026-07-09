import type { SocialDashboardClient } from '../socialDashboardClient'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from './socialDashboardNormalize'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from '../constants'
import type {
  FeedProvider, FeedProviderContext, DealerLink, FeedRef, CreateFeedSpec, FeedMetrics
} from '../types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

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
  const rulesets = Array.isArray(base.rulesets) ? base.rulesets.filter(isRecord) : null
  if (rulesets) {
    const scopedRulesets = rulesets.flatMap((rule, idx: number) => {
      const currentSeller = String(rule?.sellerId ?? '').trim()
      if (currentSeller) return allowedSet.has(currentSeller) ? [{ ...rule }] : []
      return allowed.map(sellerId => ({
        ...rule,
        id: `${String(rule?.id ?? `ruleset-${idx}`)}:${sellerId}`,
        sellerId
      }))
    })

    return {
      ...base,
      rulesets: scopedRulesets.length
        ? scopedRulesets
        : [{ id: 'no-matching-seller', sellerId: noMatchingSellerId() }],
      manualIncludeIds: undefined
    }
  }

  const requested = uniqueStrings([
    ...strings(base.sellerIds),
    ...strings(base.dealerIds)
  ])
  const scopedSellerIds = requested.length ? requested.filter(id => allowedSet.has(id)) : allowed
  delete base.dealerIds
  delete base.selectionMode

  return {
    ...base,
    sellerIds: scopedSellerIds.length ? scopedSellerIds : [noMatchingSellerId()]
  }
}

function orgQuery(ctx: FeedProviderContext): string {
  return `?${new URLSearchParams({ orgId: ctx.externalOrgId }).toString()}`
}

function normalizeGenerateResult(raw: unknown): { url: string, itemCount: number } {
  const input = isRecord(raw) ? raw : {}
  const meta = isRecord(input.meta) ? input.meta : input
  return {
    url: String(meta?.url ?? ''),
    itemCount: Number(meta?.itemCount ?? meta?.item_count ?? 0)
  }
}

function normalizeMetricsResult(raw: unknown): FeedMetrics {
  const input = isRecord(raw) ? raw : {}
  const vehicleStats = isRecord(input.vehicleStats) ? input.vehicleStats : null
  const inventory = Number(input.inventory ?? vehicleStats?.forSaleNow ?? 0)
  return {
    inventory: Number.isFinite(inventory) ? inventory : 0,
    active: Number(input.active ?? inventory ?? 0) || 0,
    issues: Number(input.issues ?? 0) || 0,
    fetchedAt: new Date().toISOString()
  }
}

function upsertNotAvailable(error: unknown): boolean {
  return /POST \/api\/feeds\/upsert-external → 404/.test(error instanceof Error ? error.message : String(error))
}

function createPayload(link: DealerLink, spec: CreateFeedSpec): Record<string, unknown> {
  return {
    name: spec.name,
    feed_type: spec.platform,
    organization_id: link.externalOrgId,
    filters: buildInventoryPreviewFilters(spec.filters ?? {}, link.sellerRefs),
    mappings: spec.mappings ?? {},
    platform_settings: spec.platformSettings ?? {},
    source: spec.source
  }
}

function upsertPayload(link: DealerLink, spec: CreateFeedSpec): Record<string, unknown> {
  const payload = createPayload(link, spec)
  return {
    ...payload,
    externalKey: spec.externalKey,
    externalClientId: spec.externalClientId ?? link.clientId,
    externalCampaignId: spec.externalCampaignId,
    externalFeedId: spec.externalFeedId
  }
}

export function createSocialDashboardProvider(client: SocialDashboardClient): FeedProvider {
  return {
    id: SOCIAL_DASHBOARD_PROVIDER_ID,
    label: 'Social Dashboard (Vehicle Feed Platform)',

    async listFeeds(ctx, link) {
      assertOrgMatch(ctx, link)
      const r = await client.call<{ items?: unknown[] }>(ctx, 'GET', `/api/feeds${orgQuery(ctx)}`)
      return (r.items ?? []).map(normalizeFeedSummary)
    },

    async getFeed(ctx, ref: FeedRef) {
      const r = await client.call<{ item: unknown }>(ctx, 'GET', `/api/feeds/${ref.feedId}`)
      return normalizeFeedDetail(r.item)
    },

    async previewFeed(ctx, link: DealerLink, ref: FeedRef, opts) {
      assertOrgMatch(ctx, link)
      const detailResult = await client.call<{ item: unknown }>(ctx, 'GET', `/api/feeds/${ref.feedId}`)
      const detail = normalizeFeedDetail(detailResult.item)
      const filters = buildInventoryPreviewFilters({
        ...detail.filters,
        ...(opts.search?.trim() ? { search: opts.search.trim() } : {})
      }, link.sellerRefs)

      const r = await client.call<{ total?: number, items?: unknown[] }>(ctx, 'POST', `/api/feeds/preview`, {
        filters,
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
        validateForFeed: {
          feedType: ref.platform,
          mappings: detail.mappings,
          platformSettings: detail.platformSettings,
          source: detail.source ?? undefined
        }
      })
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async searchInventory(ctx, link: DealerLink, filters) {
      assertOrgMatch(ctx, link)
      const r = await client.call<{ total?: number, items?: unknown[] }>(ctx, 'POST', `/api/feeds/preview`, {
        filters: buildInventoryPreviewFilters(filters, link.sellerRefs),
        limit: 100,
        offset: 0
      })
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async createFeed(ctx, link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef> {
      assertOrgMatch(ctx, link)
      try {
        const r = await client.call<{ id?: string, feedId?: string }>(ctx, 'POST', `/api/feeds/upsert-external`, upsertPayload(link, spec))
        return { providerId: SOCIAL_DASHBOARD_PROVIDER_ID, feedId: String(r.feedId || r.id), platform: spec.platform }
      } catch (error) {
        if (!upsertNotAvailable(error)) throw error
        const r = await client.call<{ id: string }>(ctx, 'POST', `/api/feeds`, createPayload(link, spec))
        return { providerId: SOCIAL_DASHBOARD_PROVIDER_ID, feedId: String(r.id), platform: spec.platform }
      }
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
    }
  }
}
