import { describe, it, expect, vi } from 'vitest'
import { buildFeedReadRunner } from '~~/server/utils/ai/mcp/feedRunner'

vi.mock('~~/server/utils/db', () => ({ queryRows: async () => [] }))
vi.mock('~~/server/utils/ai/pendingActions', () => ({ proposeAction: vi.fn() }))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({
  getDealerLink: async () => ({ clientId: 'client', providerId: 'social-dashboard', externalOrgId: 'org', sellerRefs: ['dealer'], defaultFeedIds: [] }),
  linkToContext: () => ({ actingUserEmail: 'owner@example.com', externalOrgId: 'org' })
}))
vi.mock('~~/server/utils/feeds/config', () => ({
  getSocialDashboardClient: async () => ({}),
  resolveSocialDashboardBaseUrl: async () => 'https://feeds.example.com'
}))
vi.mock('~~/server/utils/feeds/registry', () => ({ getFeedProvider: () => ({
  listFeeds: async () => [{ id: 'feed', name: 'Demo stock', platform: 'facebook', isActive: false }],
  previewFeed: async (_ctx: unknown, _link: unknown, _ref: unknown, opts: { limit: number }) => {
    // The live feed service rejects previews outside this range.
    if (opts.limit < 1 || opts.limit > 100) throw new Error('limit must be between 1 and 100')
    return { total: 14, items: [], validation: { matchedTotal: 14, validatedTotal: 0, invalidTotal: 14, showingFallbackCandidates: true, invalidSummaries: [{ id: 'one', issues: [{ field: 'url', message: 'Missing URL' }] }], invalidIssueCounts: [{ field: 'url', count: 14, label: 'Missing URL' }] } }
  }
}) }))
vi.mock('~~/server/utils/metaCatalogProvider', () => ({ createMetaCatalogProvider: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogApplication', () => ({ attachMetaCatalogFeedForClient: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogRepository', () => ({ getMetaCatalogConnectionAuthority: vi.fn() }))

describe('inventory feed health before catalogue attachment', () => {
  it('shows paused unbound feeds and distinguishes eligible items from matching invalid inventory', async () => {
    const result = await buildFeedReadRunner().get_inventory_feed_health({ clientId: 'client' }, { userId: 'owner', userRole: 'owner', userEmail: 'owner@example.com', event: {} as never, source: 'mcp' })
    expect(result.dataStatus).toBe('no_catalog_binding')
    expect(result.feeds).toEqual([expect.objectContaining({ feedId: 'feed', isActive: false, itemCount: 0, matchedItemCount: 14, previewLimit: 100, catalog: null, bindingState: 'unbound', excluded: expect.objectContaining({ totalExcluded: 14 }) })])
  })
})
