import type { SocialDashboardClient } from '../socialDashboardClient'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from './socialDashboardNormalize'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from '../constants'
import type {
  FeedProvider, FeedProviderContext, DealerLink, FeedRef, CreateFeedSpec, FeedMetrics,
  FeedPreviewValidation, FeedValidationIssueSummary
} from '../types'

type UnknownRecord = Record<string, unknown>
type PreviewResponse = {
  total?: unknown
  matchedTotal?: unknown
  matched_total?: unknown
  validatedTotal?: unknown
  validated_total?: unknown
  invalidTotal?: unknown
  invalid_total?: unknown
  candidateLimit?: unknown
  candidate_limit?: unknown
  invalidSummaries?: unknown
  invalid_summaries?: unknown
  items?: unknown
}

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

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(String).map(s => s.trim()).filter(Boolean)))
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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

function normalizeInvalidSummaries(value: unknown): FeedValidationIssueSummary[] {
  return array(value)
    .map((summary) => {
      const item = isRecord(summary) ? summary : {}
      const id = item.id ?? item.vehicleId ?? item.vehicle_id ?? item.stockNumber ?? item.stock_number ?? null
      const issues = array(item.issues).length
        ? array(item.issues)
        : [item.issue, item.message].filter(Boolean)

      return {
        id: id == null ? null : String(id),
        issues
      }
    })
    .filter(summary => summary.id || summary.issues.length)
}

function previewMatchedTotal(r: PreviewResponse): number {
  return finiteNumber(r.matchedTotal ?? r.matched_total ?? r.total)
}

function previewValidatedTotal(r: PreviewResponse, validatedItemCount: number): number {
  return finiteNumber(r.validatedTotal ?? r.validated_total, validatedItemCount)
}

function normalizePreviewValidation(
  r: PreviewResponse,
  showingFallbackCandidates: boolean,
  validatedItemCount: number
): FeedPreviewValidation | undefined {
  const hasValidationMetadata = [
    r.matchedTotal,
    r.matched_total,
    r.validatedTotal,
    r.validated_total,
    r.invalidTotal,
    r.invalid_total,
    r.candidateLimit,
    r.candidate_limit,
    r.invalidSummaries,
    r.invalid_summaries
  ].some(value => value !== undefined)

  if (!hasValidationMetadata && !showingFallbackCandidates) return undefined

  const matchedTotal = previewMatchedTotal(r)
  const validatedTotal = previewValidatedTotal(r, validatedItemCount)
  const invalidTotal = finiteNumber(
    r.invalidTotal ?? r.invalid_total,
    Math.max(matchedTotal - validatedTotal, 0)
  )
  const candidateLimit = r.candidateLimit ?? r.candidate_limit

  return {
    matchedTotal,
    validatedTotal,
    invalidTotal,
    candidateLimit: candidateLimit === undefined ? undefined : finiteNumber(candidateLimit),
    invalidSummaries: normalizeInvalidSummaries(r.invalidSummaries ?? r.invalid_summaries),
    showingFallbackCandidates
  }
}

function validationPlatformSettings(detail: { name?: string, platformSettings?: Record<string, unknown> }): Record<string, unknown> {
  const settings = detail.platformSettings && typeof detail.platformSettings === 'object'
    ? { ...detail.platformSettings }
    : {}
  const name = String(detail.name ?? '').trim()
  if (name && typeof settings.feed_name !== 'string') settings.feed_name = name
  return settings
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
      const limit = opts.limit ?? 20
      const offset = opts.offset ?? 0
      const filters = buildInventoryPreviewFilters({
        ...detail.filters,
        ...(opts.search?.trim() ? { search: opts.search.trim() } : {})
      }, link.sellerRefs)

      const r = await client.call<PreviewResponse>(ctx, 'POST', `/api/feeds/preview`, {
        filters,
        limit,
        offset,
        validateForFeed: {
          feedType: ref.platform,
          mappings: detail.mappings,
          platformSettings: validationPlatformSettings(detail),
          source: detail.source ?? undefined
        }
      })
      const validatedItems = array(r.items)
      const matchedTotal = previewMatchedTotal(r)
      const validatedTotal = previewValidatedTotal(r, validatedItems.length)
      let items = validatedItems
      let showingFallbackCandidates = false

      if (offset === 0 && validatedItems.length === 0 && matchedTotal > 0 && validatedTotal === 0) {
        const fallback = await client.call<PreviewResponse>(ctx, 'POST', `/api/feeds/preview`, {
          filters,
          limit,
          offset
        })
        items = array(fallback.items)
        showingFallbackCandidates = items.length > 0
      }

      const validation = normalizePreviewValidation(r, showingFallbackCandidates, validatedItems.length)
      return {
        total: matchedTotal,
        items: items.map(normalizeVehicle),
        ...(validation ? { validation } : {})
      }
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
