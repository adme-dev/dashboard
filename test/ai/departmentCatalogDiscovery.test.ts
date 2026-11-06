import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDepartmentCatalogTool } from '~~/server/utils/ai/mcp/departmentCatalogTools'

const m = vi.hoisted(() => ({
  authority: vi.fn(), query: vi.fn(), rows: vi.fn(), bindings: vi.fn(), connection: vi.fn(), link: vi.fn(),
  provider: { listGrantedPermissions: vi.fn(), getAdAccountBusiness: vi.fn(), listBusinessCatalogs: vi.fn(), listProductFeeds: vi.fn(), listProductSets: vi.fn(), updateProductSet: vi.fn(), getProductSet: vi.fn(), createVehicleCatalog: vi.fn(), createProductFeed: vi.fn(), updateProductFeed: vi.fn(), createProductSet: vi.fn(), getProductFeed: vi.fn(), createProductFeedUpload: vi.fn(), getProductFeedUpload: vi.fn() },
  feed: { listFeeds: vi.fn(), getFeed: vi.fn() }
}))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, queryRowsFresh: m.rows, transactionWithoutRetry: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogRepository', () => ({ getMetaCatalogConnectionAuthority: m.connection, listMetaCatalogFeedBindings: m.bindings, persistMetaCatalogFeedEvidence: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogProvider', async importOriginal => ({ ...(await importOriginal<Record<string, unknown>>()), createMetaCatalogProvider: () => m.provider }))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({ getDealerLink: m.link, linkToContext: () => ({ externalOrgId: 'org' }) }))
vi.mock('~~/server/utils/feeds/config', () => ({ getSocialDashboardClient: vi.fn().mockResolvedValue({}), resolveSocialDashboardBaseUrl: vi.fn().mockResolvedValue('https://socials.example') }))
vi.mock('~~/server/utils/feeds/registry', () => ({ getFeedProvider: () => m.feed }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: m.authority }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({
  requireIndependentMarketingReviewer: vi.fn(),
  assertMarketingCapabilityAtBoundary: vi.fn().mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'] })
}))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ serverEnabled: true, suiteFlags: { feeds: true, writes: true } }) }))

const ids = {
  client: '11111111-1111-4111-8111-111111111111', connection: '22222222-2222-4222-8222-222222222222', source: '33333333-3333-4333-8333-333333333333',
  author: '44444444-4444-4444-8444-444444444444', peer: '55555555-5555-4555-8555-555555555555', proposal: '66666666-6666-4666-8666-666666666666'
}
const env = { DEALER_FEEDS_ENABLED: 'true' }
const ctxFor = (userId: string) => ({ userId, source: 'mcp', assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] }, event: { context: { cloudflare: { env } } } })
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
const call = (name: string, args: unknown, actor = ids.author) => executeDepartmentCatalogTool(name, args, ctxFor(actor) as never, key, digest)

beforeEach(() => {
  vi.clearAllMocks()
  m.authority.mockImplementation(async (c: unknown) => c)
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('agency_clients')) return { id: ids.client }
    throw new Error('Unexpected query')
  })
  m.rows.mockResolvedValue([])
  m.bindings.mockResolvedValue([{ catalogId: '123456', sourceFeedId: ids.source, productFeedId: '555555' }])
  m.connection.mockResolvedValue({ id: ids.connection, accountId: '123456789', actId: 'act_123456789', accessToken: 'secret', tokenExpiresAt: null })
  m.link.mockResolvedValue({ clientId: ids.client, providerId: 'social-dashboard', externalOrgId: 'org', sellerRefs: ['seller'], defaultFeedIds: [ids.source] })
  m.feed.listFeeds.mockResolvedValue([{ id: ids.source, platform: 'facebook', isActive: true }])
  m.feed.getFeed.mockResolvedValue({ id: ids.source, name: 'Feed', platform: 'facebook', isActive: true, source: { type: 'meilisearch' }, filters: { sellerIds: ['seller'] } })
  m.provider.listGrantedPermissions.mockResolvedValue(['catalog_management', 'business_management'])
  m.provider.getAdAccountBusiness.mockResolvedValue({ id: 'business' })
  m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'vehicles' }])
  m.provider.listProductFeeds.mockResolvedValue([{ id: '555555' }])
  m.provider.listProductSets.mockResolvedValue([{ id: '777777', product_count: 12 }])
  m.provider.updateProductSet.mockResolvedValue(undefined)
})

const discovery = { clientId: ids.client, connectionId: ids.connection, sourceFeedId: ids.source }
describe('staff catalogue identifier discovery', () => {
  it('lists only safe connection/account and persisted binding IDs from a fresh scoped active query', async () => {
    m.rows.mockResolvedValue([{ id: ids.connection, account_id: '123456789', access_token: 'never-return-this', metadata: { secret: 'also-private' } }])
    const result = await call('marketing_list_catalog_connections', { clientId: ids.client })
    expect(result).toMatchObject({ ok: true, data: { connections: [{ connectionId: ids.connection, accountId: '123456789', actId: 'act_123456789', bindings: [{ catalogId: '123456', sourceFeedId: ids.source, productFeedId: '555555' }] }] } })
    const [sql, params] = m.rows.mock.calls[0]
    expect(params).toEqual([ids.client])
    expect(sql).toContain('client_id=$1')
    expect(sql).toContain('platform=\'meta\'')
    expect(sql).toContain('status=\'active\'')
    expect(sql).not.toContain('access_token')
    expect(JSON.stringify(result)).not.toContain('never-return-this')
    expect(JSON.stringify(result)).not.toContain('also-private')
  })
  it('discovers manually created commerce catalogue IDs using only the exact source URL proof', async () => {
    m.bindings.mockResolvedValue([])
    m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', name: 'private catalogue name', vertical: 'commerce' }])
    m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }])
    const result = await call('marketing_find_client_catalogs', discovery)
    expect(result).toMatchObject({ ok: true, data: { catalogs: [{ catalogId: '123456', productFeedId: '555555', catalogType: 'COMMERCE', persistedBinding: false }], nextCursor: null } })
    expect(JSON.stringify(result)).not.toContain('private catalogue name')
  })
  it('does not expose foreign catalogue identities even if their feed URL matches', async () => {
    m.rows.mockResolvedValue([{ client_id: 'foreign-client' }])
    const result = await call('marketing_find_client_catalogs', discovery)
    expect(result).toMatchObject({ ok: true, data: { catalogs: [] } })
    expect(JSON.stringify(result)).not.toContain('123456')
    expect(m.provider.listProductFeeds).not.toHaveBeenCalled()
  })
  it('never infers ownership from a business name or unmatched feed URL', async () => {
    m.bindings.mockResolvedValue([])
    m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: 'https://foreign.example' } }])
    const result = await call('marketing_find_client_catalogs', discovery)
    expect(result).toMatchObject({ ok: true, data: { catalogs: [] } })
    expect(JSON.stringify(result)).not.toContain('123456')
  })
  it('returns a persisted binding only after verifying exact product feed membership', async () => {
    expect((await call('marketing_find_client_catalogs', discovery)).data).toMatchObject({ catalogs: [{ catalogId: '123456', productFeedId: '555555', persistedBinding: true }] })
    m.provider.listProductFeeds.mockResolvedValue([{ id: '999999' }])
    expect((await call('marketing_find_client_catalogs', discovery)).data).toMatchObject({ catalogs: [] })
  })
  it('bounds candidate checks to ten per call and uses the cursor for the remaining candidates', async () => {
    m.bindings.mockResolvedValue([])
    m.provider.listBusinessCatalogs.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ id: String(100000 + i), name: `private-${i}`, vertical: 'vehicles' })))
    m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }])
    const first = await call('marketing_find_client_catalogs', { ...discovery, limit: 10 })
    expect(first.data).toMatchObject({ nextCursor: 10 })
    expect(m.provider.listProductFeeds).toHaveBeenCalledTimes(10)
    const second = await call('marketing_find_client_catalogs', { ...discovery, cursor: 10, limit: 10 })
    expect(second.data).toMatchObject({ catalogs: [{ catalogId: '100010' }, { catalogId: '100011' }], nextCursor: null })
    expect(m.provider.listProductFeeds).toHaveBeenCalledTimes(12)
    expect((await call('marketing_find_client_catalogs', { ...discovery, limit: 11 })).code).toBe('bad_args')
  })
  it('fails closed when source is not explicitly default-bound or client access is revoked', async () => {
    m.bindings.mockResolvedValue([])
    m.link.mockResolvedValue({ clientId: ids.client, providerId: 'social-dashboard', externalOrgId: 'org', sellerRefs: ['seller'], defaultFeedIds: [] })
    m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }])
    expect((await call('marketing_find_client_catalogs', discovery)).data).toMatchObject({ catalogs: [] })
    m.query.mockResolvedValue(null)
    expect((await call('marketing_list_catalog_connections', { clientId: ids.client })).code).toBe('not_found')
    expect(m.rows).not.toHaveBeenCalledWith(expect.stringContaining('social_connections'), expect.anything())
  })
  it('skips unavailable candidate evidence without leaking provider error text', async () => {
    m.provider.listProductFeeds.mockRejectedValue(new Error('token=secret'))
    const result = await call('marketing_find_client_catalogs', discovery)
    expect(result).toMatchObject({ ok: true, data: { catalogs: [], partial: true } })
    expect(JSON.stringify(result)).not.toContain('token=')
  })
})

it('preserves discovery for an exact persisted binding on a nondefault native source', async () => {
  m.link.mockResolvedValue({ clientId: ids.client, providerId: 'social-dashboard', externalOrgId: 'org', sellerRefs: ['seller'], defaultFeedIds: [] })
  expect((await call('marketing_find_client_catalogs', discovery)).data).toMatchObject({ catalogs: [{ catalogId: '123456', persistedBinding: true }] })
})
it('filters malicious stored identifiers without exposing their contents', async () => {
  m.rows.mockResolvedValue([{ id: ids.connection, account_id: 'token=private' }, { id: 'invalid-connection-secret', account_id: '999999' }])
  m.bindings.mockResolvedValue([{ catalogId: 'private-catalog-id', sourceFeedId: ids.source, productFeedId: '555555' }])
  const result = await call('marketing_list_catalog_connections', { clientId: ids.client })
  expect(result.data).toMatchObject({ connections: [{ connectionId: ids.connection, bindings: [] }] })
  expect(JSON.stringify(result)).not.toContain('private')
  expect(JSON.stringify(result)).not.toContain('invalid-connection-secret')
})
it('rejects multiple-feed URL ambiguity instead of adopting a catalogue with mixed ownership', async () => {
  m.bindings.mockResolvedValue([])
  m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }, { id: '999999', schedule: { url: 'https://foreign.example' } }])
  expect((await call('marketing_find_client_catalogs', discovery)).data).toMatchObject({ catalogs: [] })
})
