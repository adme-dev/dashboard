import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaCatalogGraphError } from '~~/server/utils/metaCatalogProvider'
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
  authority: vi.fn(), query: vi.fn(), rows: vi.fn(), transaction: vi.fn(), bindings: vi.fn(), connection: vi.fn(), link: vi.fn(), reviewer: vi.fn(),
  provider: { listGrantedPermissions: vi.fn(), getAdAccountBusiness: vi.fn(), listBusinessCatalogs: vi.fn(), listProductFeeds: vi.fn(), listProductSets: vi.fn(), updateProductSet: vi.fn(), getProductSet: vi.fn(), createVehicleCatalog: vi.fn(), createProductFeed: vi.fn(), updateProductFeed: vi.fn(), createProductSet: vi.fn(), getProductFeed: vi.fn(), createProductFeedUpload: vi.fn(), getProductFeedUpload: vi.fn() },
  feed: { listFeeds: vi.fn(), getFeed: vi.fn() }
}))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, queryRowsFresh: m.rows, transactionWithoutRetry: m.transaction }))
vi.mock('~~/server/utils/metaCatalogRepository', () => ({ getMetaCatalogConnectionAuthority: m.connection, listMetaCatalogFeedBindings: m.bindings, persistMetaCatalogFeedEvidence: vi.fn() }))
vi.mock('~~/server/utils/metaCatalogProvider', async importOriginal => ({ ...(await importOriginal<Record<string, unknown>>()), createMetaCatalogProvider: () => m.provider }))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({ getDealerLink: m.link, linkToContext: () => ({ externalOrgId: 'org' }) }))
vi.mock('~~/server/utils/feeds/config', () => ({ getSocialDashboardClient: vi.fn().mockResolvedValue({}), resolveSocialDashboardBaseUrl: vi.fn().mockResolvedValue('https://socials.example') }))
vi.mock('~~/server/utils/feeds/registry', () => ({ getFeedProvider: () => m.feed }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: m.authority }))
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
const env = { DEALER_FEEDS_ENABLED: 'true' }
const ctxFor = (userId: string) => ({ userId, source: 'mcp', assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] }, event: { context: { cloudflare: { env } } } })
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
let row: Row | undefined
const call = (name: string, args: unknown, actor = ids.author) => executeDepartmentCatalogTool(name, args, ctxFor(actor) as never, key, digest)

beforeEach(() => {
  vi.clearAllMocks()
  row = undefined
  m.authority.mockImplementation(async (c: unknown) => c)
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

const bound = { clientId: ids.client, connectionId: ids.connection, catalogId: '123456', sourceFeedId: ids.source }
async function approveRepair(name: string, args: unknown, requestKey = key) {
  if (name === 'marketing_propose_vehicle_catalog') m.bindings.mockResolvedValue([])
  expect((await executeDepartmentCatalogTool(name, args, ctxFor(ids.author) as never, requestKey, digest)).ok).toBe(true)
  const exact = { clientId: ids.client, proposalId: ids.proposal, expectedRevision: row!.resolved_payload.revision, ack: true }
  expect((await call('marketing_approve_catalog_change', exact, ids.peer)).ok).toBe(true)
  return exact
}
describe('catalogue repair runtime', () => {
  it('diagnoses a bound commerce mismatch and projects upload codes without credentials', async () => {
    m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'commerce' }])
    m.provider.getProductFeed.mockResolvedValue({ id: '555555', latest_upload: { id: '888888', error_count: 4, url: 'https://secret:password@source' } })
    const result = await call('marketing_diagnose_catalog', bound)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ catalogType: 'COMMERCE', vehicleCatalogRequired: true, upload: { uploadId: '888888', errorCount: 4 } })
    expect(JSON.stringify(result)).not.toContain('password')
  })
  it('creates a reviewed New & Demo set and never repeats an uncertain create', async () => {
    const filter = { clauses: [{ field: 'custom_label_0', operator: 'is_any', value: ['new', 'demo'] }] }
    const exact = await approveRepair('marketing_propose_product_set', { ...bound, name: 'New & Demo', filter })
    m.provider.createProductSet.mockRejectedValue(new Error('lost acknowledgement secret'))
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createProductSet).toHaveBeenCalledTimes(1)
    expect(row!.result_payload).toMatchObject({ operation: 'create_product_set', complete: false })
  })
  it('records a new set ID before reading it back and completes only with matching rules', async () => {
    const exact = await approveRepair('marketing_propose_product_set', { ...bound, name: 'New & Demo', filter })
    m.provider.createProductSet.mockResolvedValue({ id: '777777' })
    m.provider.getProductSet.mockImplementation(async () => {
      expect(row!.result_payload).toMatchObject({ productSetId: '777777', complete: false })
      return { id: '777777', filter: JSON.stringify(metaFilter), product_count: 9 }
    })
    expect((await call('marketing_execute_catalog_change', exact)).ok).toBe(true)
    expect(row!.result_payload).toMatchObject({ complete: true, providerServingVerified: false })
  })
  it('refreshes only the existing binding with the canonical source URL', async () => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.provider.createProductFeedUpload.mockResolvedValue({ id: '888888' })
    m.provider.getProductFeed.mockResolvedValue({ id: '555555', latest_upload: { id: '888888' } })
    expect((await call('marketing_execute_catalog_change', exact)).ok).toBe(true)
    expect(m.provider.createProductFeedUpload).toHaveBeenCalledWith('555555', `https://socials.example/api/feeds/${ids.source}/serve`)
    expect(row!.result_payload).toMatchObject({ uploadId: '888888', complete: true, providerAccepted: false })
  })
  it('refuses commerce diagnosis without an exact persisted client binding', async () => {
    m.bindings.mockResolvedValue([])
    m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'commerce' }])
    expect((await call('marketing_diagnose_catalog', bound)).code).toBe('ownership_unproven')
  })
})

describe('catalogue creation and fresh authority', () => {
  const create = { clientId: ids.client, connectionId: ids.connection, sourceFeedId: ids.source, name: 'Knox Ford Vehicles' }
  it('claims once and retains the created catalogue ID before a later feed failure', async () => {
    const exact = await approveRepair('marketing_propose_vehicle_catalog', create)
    m.provider.createVehicleCatalog.mockImplementation(async () => {
      expect(row!.status).toBe('executed')
      expect(row!.result_payload).toMatchObject({ operation: 'create_catalog', complete: false })
      return { id: '999999' }
    })
    // The created catalogue cannot be read back yet. Hold the partial ID, never create again.
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(row!.result_payload).toMatchObject({ catalogId: '999999', complete: false })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createVehicleCatalog).toHaveBeenCalledTimes(1)
    expect(m.provider.createVehicleCatalog).toHaveBeenCalledWith('business', { name: 'Knox Ford Vehicles' })
  })
  it('retains a lost create acknowledgement without retrying', async () => {
    const exact = await approveRepair('marketing_propose_vehicle_catalog', create)
    m.provider.createVehicleCatalog.mockRejectedValue(new Error('provider lost ack'))
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createVehicleCatalog).toHaveBeenCalledOnce()
  })
  it('rejects changed connection business before the first provider write', async () => {
    const exact = await approveRepair('marketing_propose_vehicle_catalog', create)
    m.provider.getAdAccountBusiness.mockResolvedValue({ id: 'foreign-business' })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('revision_conflict')
    expect(m.provider.createVehicleCatalog).not.toHaveBeenCalled()
  })
  it('rejects revoked write authority after independent approval', async () => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.authority.mockRejectedValue(new Error('revoked'))
    expect((await call('marketing_execute_catalog_change', exact)).ok).toBe(false)
    expect(m.provider.createProductFeedUpload).not.toHaveBeenCalled()
  })
  it('reads expanded upload errors using safe types and counts only', async () => {
    m.provider.getProductFeed.mockResolvedValue({ id: '555555', latest_upload: { id: '888888', start_time: '2026-11-06', error_count: 1,
      errors: { data: [{ error_type: 'INVALID_DRIVETRAIN', severity: 'fatal', total_count: 4, summary: 'token=secret' }] } } })
    const result = await call('marketing_get_catalog_upload_status', bound)
    expect(result.data).toMatchObject({ upload: { status: 'PROCESSING', errors: [{ type: 'INVALID_DRIVETRAIN', severity: 'fatal', totalCount: 4 }] } })
    expect(JSON.stringify(result)).not.toContain('token=')
  })
})

it('completes reviewed vehicle creation with feed attachment and persists each identity first', async () => {
  const exact = await approveRepair('marketing_propose_vehicle_catalog', { clientId: ids.client, connectionId: ids.connection, sourceFeedId: ids.source, name: 'Knox Ford Vehicles' })
  m.provider.createVehicleCatalog.mockImplementation(async () => {
    m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '999999', vertical: 'vehicles' }])
    return { id: '999999' }
  })
  m.provider.listProductFeeds.mockResolvedValue([])
  m.provider.createProductFeed.mockImplementation(async () => {
    expect(row!.result_payload).toMatchObject({ catalogId: '999999', complete: false })
    return { id: '555555' }
  })
  m.provider.createProductFeedUpload.mockImplementation(async () => {
    expect(row!.result_payload).toMatchObject({ catalogId: '999999', productFeedId: '555555', complete: false })
    return { id: '888888' }
  })
  m.provider.getProductFeed.mockImplementation(async () => {
    expect(row!.result_payload).toMatchObject({ uploadId: '888888', complete: false })
    return { id: '555555', schedule: { interval: 'DAILY', hour: 0, timezone: 'Australia/Melbourne', url: `https://socials.example/api/feeds/${ids.source}/serve` } }
  })
  // Reset only catalogue list for the pre-claim exact revision check.
  m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'vehicles' }])
  expect((await call('marketing_execute_catalog_change', exact)).ok).toBe(true)
  expect(row!.result_payload).toMatchObject({ catalogId: '999999', productFeedId: '555555', uploadId: '888888', complete: true, providerAccepted: false })
})

it('diagnoses the manually configured commerce catalogue by its exact client serve URL', async () => {
  m.bindings.mockResolvedValue([])
  m.provider.listBusinessCatalogs.mockResolvedValue([{ id: '123456', vertical: 'commerce' }])
  m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }])
  m.provider.getProductFeed.mockResolvedValue({ id: '555555', latest_upload: { id: '888888', error_count: 1 } })
  expect((await call('marketing_diagnose_catalog', bound)).data).toMatchObject({ catalogType: 'COMMERCE', persistedBinding: false })
})
it('adopts only the manually configured feed with its exact client serve URL', async () => {
  m.bindings.mockResolvedValue([])
  m.provider.listProductFeeds.mockResolvedValue([{ id: '555555', schedule: { url: `https://socials.example/api/feeds/${ids.source}/serve` } }])
  expect((await call('marketing_propose_catalog_feed', bound)).ok).toBe(true)
})
it('blocks another Vehicles catalogue when this source is already bound to one', async () => {
  expect((await call('marketing_propose_vehicle_catalog', { clientId: ids.client, connectionId: ids.connection, sourceFeedId: ids.source, name: 'New duplicate' })).code).toBe('already_configured')
})

describe('definitive refresh busy rejection', () => {
  const busy = () => new MetaCatalogGraphError(400, { error: { error_subcode: 1798046, message: 'private-provider-message' } })
  it('retains a terminal rejection, reads safe status and replays the same failure without retrying', async () => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.provider.createProductFeedUpload.mockRejectedValue(busy())
    const result = await call('marketing_execute_catalog_change', exact)
    expect(result).toMatchObject({ ok: false, code: 'provider_busy', details: { operationSucceeded: false, providerRejected: true } })
    expect(row!.result_payload).toMatchObject({ complete: true, operationSucceeded: false, providerRejected: true, providerBusy: true, providerErrorCode: 1798046 })
    expect(row!.result_payload).not.toHaveProperty('readbackVerified')
    expect(JSON.stringify(result)).not.toContain('private-provider-message')
    expect((await call('marketing_get_catalog_change', { clientId: ids.client, proposalId: ids.proposal })).data).toMatchObject({ reconciliationRequired: false, outcome: { providerRejected: true } })
    expect(await call('marketing_execute_catalog_change', exact)).toEqual(result)
    expect(m.provider.createProductFeedUpload).toHaveBeenCalledOnce()
    m.provider.getProductFeed.mockResolvedValue({ id: '555555', latest_upload: { id: '888888', start_time: '2026-11-06' } })
    expect((await call('marketing_get_catalog_upload_status', bound)).data).toMatchObject({ upload: { status: 'PROCESSING' } })
  })
  it('allows a fresh separately reviewed refresh after a definitive busy rejection', async () => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.provider.createProductFeedUpload.mockRejectedValueOnce(busy())
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('provider_busy')
    const next = await approveRepair('marketing_propose_catalog_refresh', bound, `mcp:${'c'.repeat(64)}`)
    m.provider.createProductFeedUpload.mockResolvedValue({ id: '888888' })
    m.provider.getProductFeed.mockResolvedValue({ id: '555555' })
    expect((await call('marketing_execute_catalog_change', next)).ok).toBe(true)
    expect(m.provider.createProductFeedUpload).toHaveBeenCalledTimes(2)
  })
  it.each([
    new Error('unknown network response'),
    new MetaCatalogGraphError(500, { error: { error_subcode: 1798046 } }),
    new MetaCatalogGraphError(400, { error: { error_subcode: 9999 } })
  ])('keeps non-definitive failures held for reconciliation', async (error) => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.provider.createProductFeedUpload.mockRejectedValue(error)
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(row!.result_payload).toMatchObject({ complete: false })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createProductFeedUpload).toHaveBeenCalledOnce()
  })
  it('never releases a creation proposal for the same busy response', async () => {
    const exact = await approveRepair('marketing_propose_product_set', { ...bound, name: 'New & Demo', filter })
    m.provider.createProductSet.mockRejectedValue(busy())
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(row!.result_payload).toMatchObject({ complete: false })
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(m.provider.createProductSet).toHaveBeenCalledOnce()
  })
  it('keeps busy errors after a known upload ID held because an effect already occurred', async () => {
    const exact = await approveRepair('marketing_propose_catalog_refresh', bound)
    m.provider.createProductFeedUpload.mockResolvedValue({ id: '888888' })
    m.provider.getProductFeed.mockRejectedValue(busy())
    expect((await call('marketing_execute_catalog_change', exact)).code).toBe('reconciliation_required')
    expect(row!.result_payload).toMatchObject({ complete: false, uploadId: '888888' })
  })
})
