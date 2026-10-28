/* eslint-disable @stylistic/max-statements-per-line, @typescript-eslint/no-explicit-any -- compact fixture tables for heterogeneous mock provider/DB rows */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDepartmentCatalogTool } from '~~/server/utils/ai/mcp/departmentCatalogTools'

const m = vi.hoisted(() => ({ query: vi.fn(), rows: vi.fn(), bindings: vi.fn(), connection: vi.fn(), link: vi.fn(), prepare: vi.fn(), provider: { listGrantedPermissions: vi.fn(), getAdAccountBusiness: vi.fn(), listBusinessCatalogs: vi.fn(), listProductFeeds: vi.fn(), listProductSets: vi.fn(), updateProductSet: vi.fn() }, feed: { listFeeds: vi.fn(), getFeed: vi.fn() } }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, queryRowsFresh: m.rows }))
vi.mock('~~/server/utils/metaCatalogRepository', () => ({ getMetaCatalogConnectionAuthority: m.connection, listMetaCatalogFeedBindings: m.bindings, persistMetaCatalogFeedEvidence: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogProvider', () => ({ createMetaCatalogProvider: () => m.provider }))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({ getDealerLink: m.link, linkToContext: () => ({ externalOrgId: 'org' }) }))
vi.mock('~~/server/utils/feeds/config', () => ({ getSocialDashboardClient: vi.fn().mockResolvedValue({}), resolveSocialDashboardBaseUrl: vi.fn().mockResolvedValue('https://socials.example') }))
vi.mock('~~/server/utils/feeds/registry', () => ({ getFeedProvider: () => m.feed }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: async (c: unknown) => c }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ requireIndependentMarketingReviewer: vi.fn(), assertMarketingCapabilityAtBoundary: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentPaidProposals', () => ({ preparePaidProposal: m.prepare, paidProposalView: (p: unknown) => p, paidHash: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ serverEnabled: true, suiteFlags: { feeds: true, writes: true } }) }))
const clientId = '11111111-1111-4111-8111-111111111111', connectionId = '22222222-2222-4222-8222-222222222222', sourceFeedId = '33333333-3333-4333-8333-333333333333'
const input = { clientId, connectionId, sourceFeedId, catalogId: '123456' }
const ctx: any = { userId: clientId, source: 'mcp', assistantScope: { clientAccessMode: 'all_active' }, event: { context: { cloudflare: { env: { DEALER_FEEDS_ENABLED: 'true' } } } } }
beforeEach(() => {
  vi.clearAllMocks(); m.query.mockResolvedValue({ id: clientId }); m.rows.mockResolvedValue([]); m.bindings.mockResolvedValue([])
  m.connection.mockResolvedValue({ id: connectionId, accountId: '123456789', actId: 'act_123456789', accessToken: 'secret', tokenExpiresAt: null })
  m.link.mockResolvedValue({ clientId, providerId: 'social-dashboard', externalOrgId: 'org', sellerRefs: ['seller'], defaultFeedIds: [sourceFeedId] })
  m.feed.listFeeds.mockResolvedValue([{ id: sourceFeedId, platform: 'facebook', isActive: true }]); m.feed.getFeed.mockResolvedValue({ id: sourceFeedId, name: 'Feed', platform: 'facebook', isActive: true, source: { type: 'meilisearch' }, filters: { sellerIds: ['seller'] }, mappings: {}, platformSettings: {} })
  m.provider.listGrantedPermissions.mockResolvedValue(['catalog_management', 'business_management']); m.provider.getAdAccountBusiness.mockResolvedValue({ id: 'business' }); m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'vehicles' }]); m.provider.listProductFeeds.mockResolvedValue([]); m.provider.listProductSets.mockResolvedValue([]); m.prepare.mockResolvedValue({ proposalId: 'proposal', requiresIndependentReview: true })
})
const call = (name: string, args: unknown = input) => executeDepartmentCatalogTool(name, args, ctx, `mcp:${'a'.repeat(64)}`, 'b'.repeat(64))
describe('exact catalog mapping boundary', () => {
  it('prepares initial mapping only against an empty current connection-owned vehicle catalog', async () => {
    expect((await call('marketing_propose_catalog_feed')).ok).toBe(true)
    expect(m.prepare).toHaveBeenCalledOnce(); expect(m.provider.updateProductSet).not.toHaveBeenCalled()
  })
  it('rejects a catalog already mapped to another client', async () => {
    m.rows.mockResolvedValue([{ client_id: 'foreign' }])
    expect((await call('marketing_propose_catalog_feed')).code).toBe('ownership_unproven')
    expect(m.provider.listBusinessCatalogs).not.toHaveBeenCalled(); expect(m.prepare).not.toHaveBeenCalled()
  })
  it('does not use a different catalog binding as fallback for a requested product set', async () => {
    m.bindings.mockResolvedValue([{ catalogId: 'different', sourceFeedId, productFeedId: '555555' }]); m.provider.listProductSets.mockResolvedValue([{ id: '777777' }])
    expect((await call('marketing_preview_product_set', { ...input, productSetId: '777777' })).code).toBe('ownership_unproven')
  })
  it('rejects alternate native source selectors before consulting Meta', async () => {
    m.feed.getFeed.mockResolvedValue({ id: sourceFeedId, platform: 'facebook', isActive: true, source: { type: 'meilisearch', url: 'https://foreign.example' }, filters: { sellerIds: ['seller'] } })
    expect((await call('marketing_propose_catalog_feed')).code).toBe('ownership_unproven')
    expect(m.provider.listGrantedPermissions).not.toHaveBeenCalled()
  })
})
