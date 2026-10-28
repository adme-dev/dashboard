import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeDepartmentCatalogTool } from '~~/server/utils/ai/mcp/departmentCatalogTools'

interface Row {
  id: string
  user_id: string
  status: string
  expires_at: string
  resolved_payload: Record<string, unknown> & { revision: string }
  result_payload: Record<string, unknown> | null
}
const m = vi.hoisted(() => ({
  query: vi.fn(), rows: vi.fn(), transaction: vi.fn(), bindings: vi.fn(), connection: vi.fn(), link: vi.fn(), reviewer: vi.fn(),
  provider: { listGrantedPermissions: vi.fn(), getAdAccountBusiness: vi.fn(), listBusinessCatalogs: vi.fn(), listProductFeeds: vi.fn(), listProductSets: vi.fn(), updateProductSet: vi.fn(), getProductSet: vi.fn() },
  feed: { listFeeds: vi.fn(), getFeed: vi.fn() }
}))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, queryRowsFresh: m.rows, transactionWithoutRetry: m.transaction }))
vi.mock('~~/server/utils/metaCatalogRepository', () => ({ getMetaCatalogConnectionAuthority: m.connection, listMetaCatalogFeedBindings: m.bindings, persistMetaCatalogFeedEvidence: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogProvider', () => ({ createMetaCatalogProvider: () => m.provider }))
vi.mock('~~/server/utils/metaCatalogPlatform', () => ({ ensureMetaCatalogFeed: vi.fn() }))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({ getDealerLink: m.link, linkToContext: () => ({ externalOrgId: 'org' }) }))
vi.mock('~~/server/utils/feeds/config', () => ({ getSocialDashboardClient: vi.fn().mockResolvedValue({}), resolveSocialDashboardBaseUrl: vi.fn().mockResolvedValue('https://socials.example') }))
vi.mock('~~/server/utils/feeds/registry', () => ({ getFeedProvider: () => m.feed }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: async (c: unknown) => c }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({
  requireIndependentMarketingReviewer: m.reviewer,
  assertMarketingCapabilityAtBoundary: vi.fn().mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'] })
}))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ serverEnabled: true, suiteFlags: { feeds: true, writes: true } }) }))

const ids = {
  client: '11111111-1111-4111-8111-111111111111', connection: '22222222-2222-4222-8222-222222222222', source: '33333333-3333-4333-8333-333333333333',
  author: '44444444-4444-4444-8444-444444444444', peer: '55555555-5555-4555-8555-555555555555', proposal: '66666666-6666-4666-8666-666666666666'
}
const filter = { clauses: [{ field: 'make', operator: 'eq', value: 'MG' }] }
const metaFilter = { and: [{ make: { eq: 'MG' } }] }
const input = { clientId: ids.client, connectionId: ids.connection, catalogId: '123456', sourceFeedId: ids.source, productSetId: '777777', filter }
const env = { DEALER_FEEDS_ENABLED: 'true' }
const ctxFor = (userId: string) => ({ userId, source: 'mcp', assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] }, event: { context: { cloudflare: { env } } } })
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
let row: Row | undefined
const call = (name: string, args: unknown, actor = ids.author) => executeDepartmentCatalogTool(name, args, ctxFor(actor) as never, key, digest)

beforeEach(() => {
  vi.clearAllMocks()
  row = undefined
  m.reviewer.mockImplementation(async (_e: unknown, i: { requesterId: string, reviewerId: string }) => {
    if (i.requesterId === i.reviewerId) throw new Error('self review')
  })
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('agency_clients')) return { id: ids.client }
    if (sql.includes('ai_pending_actions')) return row ? structuredClone(row) : null
    throw new Error('Unexpected query')
  })
  m.rows.mockResolvedValue([])
  m.transaction.mockImplementation(async (run: (db: unknown) => unknown) => run({
    query: async (sql: string, p: unknown[]) => {
      if (sql.startsWith('SELECT')) return { rows: [] }
      if (sql.includes('INSERT INTO ai_pending_actions')) {
        row = { id: ids.proposal, user_id: String(p[0]), status: 'proposed', expires_at: new Date(Date.now() + 3600000).toISOString(), resolved_payload: JSON.parse(String(p[2])), result_payload: null }
        return { rows: [row] }
      }
      if (sql.includes('UPDATE ai_pending_actions') && row) {
        if (sql.includes('SET status=\'executed\'')) {
          if (row.status !== 'proposed' || p[1] !== row.user_id) return { rows: [] }
          row.status = 'executed'
        } else {
          row.result_payload = JSON.parse(String(p[1]))
        }
        return { rows: [{ id: ids.proposal }] }
      }
      return { rows: [] }
    }
  }))
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
  m.provider.getProductSet.mockResolvedValue({ id: '777777', filter: JSON.stringify(metaFilter), product_count: 9 })
})

async function approved() {
  expect((await call('marketing_propose_product_set_change', input)).ok).toBe(true)
  const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row!.resolved_payload.revision, ack: true }
  expect((await call('marketing_approve_catalog_change', exact)).ok).toBe(false)
  expect((await call('marketing_approve_catalog_change', exact, ids.peer)).ok).toBe(true)
  return exact
}

describe('reviewed product-set execution', () => {
  it('lets only the requester execute after independent approval and retains reviewer evidence in the receipt', async () => {
    const exact = await approved()
    expect((await call('marketing_execute_catalog_change', exact, ids.peer)).ok).toBe(false)
    expect(m.provider.updateProductSet).not.toHaveBeenCalled()
    const result = await call('marketing_execute_catalog_change', exact)
    expect(result.ok).toBe(true)
    expect(m.provider.updateProductSet).toHaveBeenCalledWith('777777', { filter: metaFilter })
    expect(row!.result_payload).toMatchObject({ complete: true, reviewerId: ids.peer, approvedRevision: exact.expectedRevision, productCount: 9, providerServingVerified: false })
    expect((await call('marketing_execute_catalog_change', exact)).ok).toBe(true)
    expect(m.provider.updateProductSet).toHaveBeenCalledTimes(1)
  })

  it('holds a readback mismatch without repeating the provider write', async () => {
    const exact = await approved()
    m.provider.getProductSet.mockResolvedValue({ id: '777777', filter: JSON.stringify({ and: [{ make: { eq: 'Other' } }] }) })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(row!.result_payload).toMatchObject({ complete: false, reviewerId: ids.peer })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.updateProductSet).toHaveBeenCalledTimes(1)
  })

  it('rejects execution when the reviewed provider snapshot changed', async () => {
    const exact = await approved()
    m.provider.listProductSets.mockResolvedValue([{ id: '777777', product_count: 50 }])
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('revision_conflict')
    expect(m.provider.updateProductSet).not.toHaveBeenCalled()
  })
})
