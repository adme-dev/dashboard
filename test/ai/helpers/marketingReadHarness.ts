import { expect, vi } from 'vitest'
export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const USER = '11111111-1111-4111-8111-111111111111'
const fixture = vi.hoisted(() => ({
  queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), transaction: vi.fn(), kvPut: vi.fn(), cachedFetch: vi.fn(), tokenRead: vi.fn(), internalFetch: vi.fn(), sync: vi.fn(),
  realAuthority: false, context: null as any, owner: false, now: '2026-10-27T00:00:00Z', missing: false, priorMissing: false, ambiguous: false, accounts: 1, targets: 1, partialCurrent: false, partialPrior: false, tenant: 'stored-tenant', parentClientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: fixture.queryOneFresh, queryRowsFresh: fixture.queryRowsFresh, queryOne: fixture.queryOne, queryRows: fixture.queryRows, execute: fixture.execute, transaction: fixture.transaction }))
vi.mock('~~/server/utils/kv', () => ({ kvPut: fixture.kvPut, cachedFetch: fixture.cachedFetch }))
vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: fixture.tokenRead, getOrgTenant: fixture.tokenRead }))
vi.mock('~~/server/utils/onDemandSync', () => ({ syncCampaignAdPerformance: fixture.sync, syncCampaignCreatives: fixture.sync, syncCampaignDeliveryDiagnostics: fixture.sync, refreshGoogleAccessTokenIfNeeded: fixture.tokenRead }))
vi.mock('~~/server/utils/ai/internalFetch', () => ({ aiInternalFetch: fixture.internalFetch }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../server/utils/ai/mcp/staffAuthority')>()
  return { resolveMcpStaffContext: (...args: Parameters<typeof actual.resolveMcpStaffContext>) => fixture.realAuthority ? actual.resolveMcpStaffContext(...args) : Promise.resolve(fixture.context) }
})

export function context(overrides: any = {}) {
  return { userId: USER, userRole: 'custom_reporting', permissionGroups: [], source: 'mcp', mcpStaffAuthority: 'fresh', marketingCapabilities: ['reporting'], assistantReadOnly: true, mcpScopes: new Set(['agency:read']), assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [A] }, event: { context: {} }, ...overrides } as any
}
export function resetHarness() {
  vi.clearAllMocks()
  fixture.realAuthority = false; fixture.context = context(); fixture.owner = false; fixture.missing = false; fixture.priorMissing = false; fixture.ambiguous = false; fixture.accounts = 1; fixture.targets = 1; fixture.partialCurrent = false; fixture.partialPrior = false; fixture.tenant = 'stored-tenant'; fixture.parentClientId = B
  fixture.sync.mockResolvedValue({ available: true, syncedRows: 1, error: null })
  for (const sink of [fixture.queryOne, fixture.queryRows, fixture.execute, fixture.transaction, fixture.kvPut, fixture.cachedFetch, fixture.tokenRead, fixture.internalFetch]) sink.mockImplementation(() => { throw Error('Forbidden legacy read or side effect') })
  fixture.queryOneFresh.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM team_members')) return fixture.owner ? { id: USER } : null
    if (sql.includes('xero_org_connection')) { expect(sql).toMatch(/^SELECT tenant_id /); return fixture.tenant ? { tenant_id: fixture.tenant } : null }
    if (sql.includes('FROM agency_clients c')) { assertScoped(sql, params, 'c.id'); return scopedRows(sql, params, [{ id: B }, { id: A }], 'c.id', 'id').find(row => row.id === params[0]) ?? null }
    if (sql.includes('campaign_search_term_syncs')) {
      assertScoped(sql, params)
      expect(sql).toContain('ms.connection_id IS NOT DISTINCT FROM $3')
      expect(sql).toContain("sync.coverage IN ('full', 'limited')")
      const candidates = [{ id: 'sync-b', client_id: B, coverage: 'full', synced_at: '2026-10-28', source_total: 9000 }, { id: 'sync-a', client_id: A, coverage: 'full', synced_at: fixture.now, source_total: 1 }]
      return scopedRows(sql, params, candidates).filter(row => row.client_id === params[0]).find(row => row.client_id !== A || !fixture.missing) ?? null
    }
    if (sql.includes('FROM leads l')) {
      assertScoped(sql, params, 'l.client_id')
      expect(sql).toContain('matched.client_id = l.client_id')
      expect(sql).toContain('COUNT(DISTINCT l.id)')
      const leads = scopedRows(sql, params, [{ client_id: B, count: 9000 }, { client_id: A, count: 1 }], 'l.client_id')
      const total = leads.reduce((sum, row) => sum + row.count, 0)
      return { total_submissions: total, campaign_attributed: total, ad_attributed: total, account_ambiguous: fixture.ambiguous }
    }
    if (sql.includes('WITH scoped_media') && sql.includes('COUNT(*) as count')) { assertScoped(sql, params); expect(sql).toMatch(/FROM daily_spend ds JOIN scoped_media sm ON sm.id = ds.media_spend_id/); return { count: scopedRows(sql, params, [{ client_id: B }, ...Array.from({ length: fixture.accounts }, () => ({ client_id: A }))]).length } }
    if (sql.includes('FROM briefs')) { assertScoped(sql, params, 'b.client_id'); return { total: scopedRows(sql, params, [{ client_id: B, total: 9000 }, { client_id: A, total: 1 }], 'b.client_id').reduce((sum, row) => sum + row.total, 0) } }
    throw Error(`Unhandled one SQL: ${sql.slice(0, 90)}`)
  })
  fixture.queryRowsFresh.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM agency_clients c') && sql.includes('agency_client_aliases')) {
      assertScoped(sql, params, 'c.id')
      assertScoped(sql, params, 'parent.id')
      expect(sql).toMatch(/LEFT JOIN agency_clients parent ON parent.id = c.parent_client_id AND parent.id = ANY/)
      const clients = [{ id: B, name: 'Forbidden B', is_active: true }, { id: A, name: 'Client A', is_active: true }]
      return scopedRows(sql, params, clients, 'c.id', 'id').map(row => {
        const parent = scopedRows(sql, params, clients, 'parent.id', 'id').find(candidate => candidate.id === fixture.parentClientId)
        return { ...row, parent_client_id: parent?.id ?? null, parent_client_name: parent?.name ?? null }
      }).slice(0, params.at(-1))
    }
    if (sql.includes('FROM social_posts') || sql.includes('FROM social_account_metrics')) {
      expect(sql).toMatch(/WHERE (p\.)?client_id = \$1[\s\S]*GROUP BY/)
      const rows = sql.includes('social_posts')
        ? [{ client_id: B, post_id: 'post-b', content: 'Forbidden B content', engagements: 9000, impressions: 9000, reach: 9000 }, { client_id: A, post_id: 'post-a', content: 'A content', published_at: fixture.now, engagements: 1, impressions: 20, reach: 10, clicks: 1 }]
        : [{ client_id: B, platform: 'meta', snapshot_date: '2026-10-01', followers: 9000 }, { client_id: A, platform: 'meta', snapshot_date: '2026-10-02', followers: 7 }]
      return rows.filter(row => row.client_id === params[0])
    }
    if (sql.includes('client_kpi_targets')) {
      expect(sql).toContain('WHERE client_id = ANY($1)')
      return [{ client_id: B, result_type: 'forbidden', target_cost_per_result: '9000' }].filter(row => params[0].includes(row.client_id))
    }
    if (sql.includes('SELECT l.status, l.source')) {
      assertScoped(sql, params, 'l.client_id')
      expect(sql).toContain('l.deleted_at IS NULL'); expect(sql).toContain('l.is_test = false')
      return scopedRows(sql, params, [{ client_id: B, status: 'new', source: 'meta', count: 9000 }, { client_id: A, status: 'new', source: 'meta', count: 1 }], 'l.client_id')
    }
    assertScoped(sql, params)
    if (sql.includes('FALSE')) return []
    if (sql.includes('campaign_search_term_snapshots term')) {
      expect(sql).toContain('JOIN campaign_search_term_syncs sync'); expect(sql).toContain('JOIN media_spend ms')
      expect(sql).toContain('ms.client_id IS NOT DISTINCT FROM $1::uuid')
      return scopedRows(sql, params, [{ client_id: B, sync_id: 'sync-b', search_term: 'Forbidden B term', cost: 9000 }, { client_id: A, sync_id: 'sync-a', search_term: 'A term', cost: 7, clicks: 2 }])
        .filter(row => row.client_id === params[0] && row.sync_id === params.at(-1))
    }
    if (sql.includes('WITH scoped_media') && sql.includes('evidence AS')) {
      expect(sql).toMatch(/WITH scoped_media AS \(\s*SELECT ms\.\*,[\s\S]*FROM media_spend ms WHERE ms.client_id = ANY/)
      expect(sql).toContain('JOIN scoped_media ms ON ms.id = aps.media_spend_id')
      expect(sql).toContain('ms.client_id IS NOT DISTINCT FROM selected.client_id')
      expect(sql).toContain('ms.reporting_platform = selected.platform')
      expect(sql).toContain('ms.connection_id IS NOT DISTINCT FROM selected.connection_id')
      expect(sql).toContain('ms.campaign_id = selected.campaign_id')
      expect(sql).toContain('aps.synced_at DESC NULLS LAST, aps.id ASC')
      expect(sql).toContain('l.client_id = ms.client_id'); expect(sql).toContain('l.campaign_id = ms.campaign_id'); expect(sql).toContain('l.ad_id = aps.ad_id')
      expect(sql).toContain('FROM scoped_media other'); expect(sql).toContain('other.client_id = l.client_id')
      const identities = JSON.parse(params[2])
      const available = identities.filter((_: any, index: number) => !(fixture.missing || (fixture.priorMissing && params[0] < '2026-10-01')) && !(((params[0] >= '2026-10-01' && fixture.partialCurrent) || (params[0] < '2026-10-01' && fixture.partialPrior)) && index === identities.length - 1))
      const rows = [
        ...identities.map((t: any) => ({ ...t, client_id: B, ad_id: 'same-ad', ad_name: 'Forbidden B ad', spend: 9000, synced_at: '2026-10-28' })),
        ...available.map((t: any) => ({ ...t, ad_id: 'same-ad', ad_name: 'A ad', client_name: 'Client A', media_spend_id: 'older-month', spend: 7, impressions: 20, clicks: 2, lead_count: 1, account_ambiguous: fixture.ambiguous, synced_at: fixture.now, approval_synced_at: fixture.now })),
      ]
      return scopedRows(sql, params, rows).filter(row => identities.some((t: any) => t.client_id === row.client_id && t.platform === row.platform && t.connection_id === row.connection_id && t.campaign_id === row.campaign_id))
    }
    if (sql.includes('SELECT DISTINCT ON') && sql.includes('ms.id, ms.client_id')) {
      expect(sql).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*ORDER BY[\s\S]*LIMIT (21|2)/)
      const allowed = Array.from({ length: fixture.targets }, (_, i) => ({ id: `new-month-${i}`, client_id: A, client_name: 'Client A', platform: /LIMIT 2\b/.test(sql) ? 'google_ads' : 'meta', campaign_id: `same-${i}`, campaign_name: 'A campaign', connection_id: `conn-${i}`, campaign_type: 'SEARCH' }))
      const forbidden = allowed.map(row => ({ ...row, id: `forbidden-${row.id}`, client_id: B, client_name: 'Forbidden B', campaign_name: 'Forbidden B campaign', spend: 9000 }))
      return scopedRows(sql, params, [...forbidden, ...allowed]).slice(0, /LIMIT 2\b/.test(sql) ? 2 : 21)
    }
    if (sql.includes('FROM campaign_creatives cc')) {
      expect(sql).toContain('JOIN media_spend ms ON ms.id = cc.media_spend_id')
      expect(sql).toContain('DISTINCT ON (ms.client_id, ms.platform, ms.connection_id, COALESCE(cc.ad_id, cc.creative_id), ms.campaign_id)')
      const rows = [{ client_id: B, ad_id: 'same-ad', creative_id: 'creative-a', title: 'Forbidden B headline', body: 'Forbidden B copy', campaign_id: 'same', platform: 'meta', synced_at: '2026-10-28' }, ...(fixture.missing ? [] : [{ client_id: A, ad_id: 'same-ad', creative_id: 'creative-a', title: 'A headline', body: 'A copy', campaign_id: 'same', campaign_name: 'A campaign', platform: 'meta', synced_at: fixture.now }])]
      return scopedRows(sql, params, rows).slice(0, params.at(-1))
    }
    if (sql.includes('SUM(COALESCE(ms.actual_spend')) {
      expect(sql).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*GROUP BY/)
      expect(sql).not.toMatch(/spend_sync_jobs/)
      return scopedRows(sql, params, [{ platform: 'meta', client_id: B, client_name: 'Forbidden B', total_budget: 10000, total_spend: 9000, spend_ids: ['media-b'] }, ...(fixture.missing ? [] : [{ platform: 'meta', client_id: A, client_name: 'Client A', total_budget: 100, total_spend: 7, campaign_count: 1, budgeted_campaign_count: 1, last_synced_at: fixture.now, oldest_synced_at: fixture.now, spend_as_of: '2026-10-27', spend_ids: ['media-a'] }])])
    }
    if (sql.includes('FROM campaigns c')) {
      expect(sql).toMatch(/authorized_media AS \(SELECT ms\.\* FROM media_spend ms WHERE ms.client_id = ANY/)
      expect(sql).toMatch(/lifetime AS \([\s\S]*JOIN scoped_media ms ON ms.id = ds.media_spend_id[\s\S]*GROUP BY ms.client_id, ms.platform, COALESCE\(ms.connection_id/)
      expect(sql).toContain('lifetime.client_id IS NOT DISTINCT FROM ms.client_id AND lifetime.platform = ms.platform')
      expect(sql).toContain("lifetime.connection_key = COALESCE(ms.connection_id::text, 'unlinked')")
      expect(sql).toContain('lifetime.campaign_key = COALESCE(ms.campaign_id, ms.id::text)')
      expect(sql).toContain('am.client_id = c.client_id AND am.platform = c.platform')
      expect(sql).toContain('l.client_id = c.client_id')
      expect(sql).toContain('JOIN scoped_media ms ON ms.id = ds.media_spend_id')
      const allowed = fixture.missing || (fixture.priorMissing && params[0] < '2026-10-01') ? [] : Array.from({ length: fixture.accounts }, (_, i) => ({ campaign_id: 'same', campaign_name: 'A campaign', client_id: A, client_name: 'Client A', platform: 'meta', connection_id: fixture.accounts === 1 ? 'conn-a' : `account-${i + 1}`, connection_account_id: `account-${i + 1}`, spend: fixture.accounts === 1 ? 7 : (i + 1) * (params[0] < '2026-10-01' ? 10 : 100), clicks: 2, impressions: 20, lead_count: 1, account_ambiguous: fixture.ambiguous, first_served_date: '2026-10-01', last_synced: fixture.now, budget_period: '2026-10', budget_period_count: 1, media_spend_id: `media-a-${i}` }))
      const forbidden = Array.from({ length: fixture.accounts }, (_, i) => ({ campaign_id: 'same', campaign_name: 'Forbidden B campaign', client_id: B, client_name: 'Forbidden B', platform: 'meta', connection_id: fixture.accounts === 1 ? 'conn-a' : `account-${i + 1}`, spend: 9000, lead_count: 9000, first_served_date: '1999-01-01' }))
      const rows = [...forbidden, ...allowed]
      return scopedRows(sql, params, rows).slice(params.at(-1), params.at(-1) + params.at(-2))
    }
    throw Error(`Unhandled rows SQL: ${sql.slice(0, 90)}`)
  })
}
export function scopedRows<T extends Record<string, any>>(sql: string, params: any[], rows: T[], column = 'ms.client_id', field = 'client_id'): T[] {
  if (sql.includes('FALSE')) return []
  const match = sql.match(new RegExp(`${column.replace('.', '\\.')} = ANY\\(\\$(\\d+)::uuid\\[\\]\\)`))
  // Deliberately return all seeded rows when the predicate is absent, so a bad query leaks B.
  const ids = match ? params[Number(match[1]) - 1] : null
  const exact = sql.match(new RegExp(`${column.replace('.', '\\.')} = \\$(\\d+)(?![\\d])`))
  return rows.filter(row => (!ids || ids.includes(row[field])) && (!exact || params[Number(exact[1]) - 1] === row[field]))
}
function assertScoped(sql: string, params: any[], column = 'ms.client_id') {
  if (sql.includes('FALSE')) return
  expect(sql).toContain(`${column} = ANY(`)
  expect(params).toContainEqual(fixture.context.assistantScope.assignedClientIds)
  expect(sql.indexOf(`${column} = ANY(`)).toBeLessThan(sql.lastIndexOf('LIMIT') < 0 ? sql.length : sql.lastIndexOf('LIMIT'))
}
export function expectNoSideEffects() {
  for (const sink of [fixture.queryOne, fixture.queryRows, fixture.execute, fixture.transaction, fixture.kvPut, fixture.cachedFetch, fixture.tokenRead, fixture.internalFetch, fixture.sync]) expect(sink).not.toHaveBeenCalled()
}

export { fixture }
