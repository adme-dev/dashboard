// server/utils/feeds/types.ts
// Provider-agnostic contract for the dealer feeds plugin. social-dashboard is
// provider #1; future direct providers (autogate/carloop) implement FeedProvider.

export type FeedPlatform = 'google' | 'facebook'

export interface FeedRef { providerId: string, feedId: string, platform: FeedPlatform }

export interface DealerLink {
  clientId: string
  providerId: string
  externalOrgId: string // social-dashboard organization_id (feed ownership)
  sellerRefs: string[] // social-dashboard seller_id / dealership_slug (inventory)
  defaultFeedIds: string[]
}

export interface FeedSummary { id: string, name: string, platform: FeedPlatform, isActive: boolean }
export interface FeedDetail extends FeedSummary {
  filters: Record<string, unknown>
  mappings: Record<string, unknown>
  platformSettings: Record<string, unknown>
  source: Record<string, unknown> | null
}

export interface VehicleSummary {
  id: string
  make: string
  model: string
  year: number | null
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  image: string | null
}

export interface FeedMetrics { inventory: number, active: number, issues: number, fetchedAt: string }

/** Asserted identity passed to the provider on every call (becomes the service-auth headers). */
export interface FeedProviderContext { actingUserEmail: string, externalOrgId: string }

export interface CreateFeedSpec {
  name: string
  platform: FeedPlatform
  filters?: Record<string, unknown>
  mappings?: Record<string, unknown>
  platformSettings?: Record<string, unknown>
  source?: Record<string, unknown>
  externalKey?: string
  externalClientId?: string
  externalCampaignId?: string
  externalFeedId?: string
}

export interface FeedProvider {
  id: string
  label: string
  listFeeds(ctx: FeedProviderContext, link: DealerLink): Promise<FeedSummary[]>
  getFeed(ctx: FeedProviderContext, ref: FeedRef): Promise<FeedDetail>
  previewFeed(ctx: FeedProviderContext, link: DealerLink, ref: FeedRef, opts: { limit?: number, offset?: number, search?: string }): Promise<{ total: number, items: VehicleSummary[] }>
  searchInventory(ctx: FeedProviderContext, link: DealerLink, filters: Record<string, unknown>): Promise<{ total: number, items: VehicleSummary[] }>
  createFeed(ctx: FeedProviderContext, link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef>
  updateFeed(ctx: FeedProviderContext, ref: FeedRef, patch: Record<string, unknown>): Promise<void>
  generateFeed(ctx: FeedProviderContext, ref: FeedRef, format: 'xml' | 'csv'): Promise<{ url: string, itemCount: number }>
  getMetrics(ctx: FeedProviderContext, ref: FeedRef): Promise<FeedMetrics>
}
