/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENT_NOW,
  departmentReadContext,
  departmentReadDb,
  fixtureClientId,
  makeFixtureClients,
  type Handlers
} from './departmentReadFixtures'

const db = vi.hoisted(() => ({
  impl: null as null | { queryRowsFresh: any, queryOneFresh: any },
  execute: vi.fn(),
  queryRows: vi.fn(),
  queryOne: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: (sql: string, params?: unknown[]) => db.impl!.queryRowsFresh(sql, params),
  queryOneFresh: (sql: string, params?: unknown[]) => db.impl!.queryOneFresh(sql, params),
  execute: db.execute,
  queryRows: db.queryRows,
  queryOne: db.queryOne
}))
const staff = vi.hoisted(() => ({ resolveMcpStaffContext: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => staff)
const internal = vi.hoisted(() => ({ aiInternalFetch: vi.fn(() => {
  throw new Error('department reads must not call internal routes')
}) }))
vi.mock('~~/server/utils/ai/internalFetch', () => internal)

const reads = await import('../../server/utils/ai/marketing/departmentReads')
const { departmentReadTools } = await import('../../server/utils/ai/mcp/departmentReadTools')

const fresh = async (ctx: any) => ctx
const deps = { authorize: fresh, now: () => DEPARTMENT_NOW }
const HOUR = 3_600_000
const recent = new Date(DEPARTMENT_NOW.getTime() - 2 * HOUR).toISOString()
const old = new Date(DEPARTMENT_NOW.getTime() - 72 * HOUR).toISOString()

function install(clients = makeFixtureClients(3), handlers: Handlers = {}) {
  const fake = departmentReadDb(clients, handlers)
  db.impl = fake
  return fake
}
beforeEach(() => {
  vi.clearAllMocks()
  db.impl = null
})

describe('department authority', () => {
  it('denies without the dedicated group before any query', async () => {
    const fake = install()
    const ctx = departmentReadContext({ permissionGroups: ['CLIENTS', 'MEDIA_BUYING', 'MANAGEMENT'] })
    await expect(reads.readDepartmentClientInventory(ctx, {}, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(fake.calls).toHaveLength(0)
  })
  it('denies without the department_management grant', async () => {
    const fake = install()
    const ctx = departmentReadContext({ marketingCapabilities: ['reporting'] })
    await expect(reads.readDepartmentBudgetHealth(ctx, {}, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(fake.calls).toHaveLength(0)
  })
  it('denies a context that is not freshly resolved', async () => {
    const fake = install()
    await expect(reads.readDepartmentLeadQuality(departmentReadContext({ mcpStaffAuthority: undefined }), {}, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(fake.calls).toHaveLength(0)
  })
  it('default boundary re-resolves authority; a revoked group fails before SQL', async () => {
    const fake = install()
    staff.resolveMcpStaffContext.mockResolvedValue(departmentReadContext({ permissionGroups: ['CLIENTS'] }))
    const result: any = await departmentReadTools.find(t => t.name === 'get_department_client_inventory')!.handler({}, departmentReadContext())
    expect(result).toMatchObject({ ok: false, code: 'DEPARTMENT_ACCESS_DENIED' })
    expect(staff.resolveMcpStaffContext).toHaveBeenCalledTimes(1)
    expect(fake.calls).toHaveLength(0)
  })
  it('client scope outside an assigned list returns nothing without querying', async () => {
    const fake = install()
    const ctx = departmentReadContext({ assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [fixtureClientId(1)], catalogReleaseIds: [] }, clientScope: fixtureClientId(2) })
    const data: any = await reads.readDepartmentCreativeInventory(ctx, {}, deps)
    expect(data.page.totalClients).toBe(0)
    expect(data.clients).toEqual([])
    expect(fake.calls).toHaveLength(0)
  })
  it('assigned scope is applied inside SQL and still excludes inactive clients', async () => {
    const fake = install(makeFixtureClients(3, 1), { 'dept:creative:page': { perClient: () => ({}) } })
    const ctx = departmentReadContext({ assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [fixtureClientId(1), fixtureClientId(3), fixtureClientId(4)], catalogReleaseIds: [] } })
    const data: any = await reads.readDepartmentCreativeInventory(ctx, {}, deps)
    expect(data.page.totalClients).toBe(2)
    expect(data.clients.map((c: any) => c.clientId)).toEqual([fixtureClientId(1), fixtureClientId(3)])
    expect(fake.calls[0].params[0]).toEqual([fixtureClientId(1), fixtureClientId(3), fixtureClientId(4)])
  })
  it('explicit clientId outside scope is a 404, inactive client too', async () => {
    install(makeFixtureClients(2, 1), { 'dept:work:page': { perClient: () => ({}) }, 'dept:work:assignees': { whole: () => [] } })
    const ctx = departmentReadContext()
    await expect(reads.readDepartmentWorkCoverage(ctx, { clientId: fixtureClientId(3) }, deps)).rejects.toMatchObject({ statusCode: 404 })
    const assigned = departmentReadContext({ assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [fixtureClientId(1)], catalogReleaseIds: [] } })
    await expect(reads.readDepartmentWorkCoverage(assigned, { clientId: fixtureClientId(2) }, deps)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('client inventory and coverage', () => {
  const inventoryHandlers: Handlers = {
    'dept:inventory:coverage': { whole: list => [{ total: list.length, with_spend: list.length - 1, with_ad_connection: list.length, with_lead_rules: 2, with_search_site: 1, with_social_inbox: 0, with_email: 0 }] },
    'dept:inventory:page': { perClient: c => c.id === fixtureClientId(1)
      ? { spend_rows: 0, spend_last_synced_at: null, active_ad_connections: 0, inactive_ad_connections: 1, lead_rules_enabled: 0, leads_30d: 0, search_site_status: null, gsc_data_through: null, open_conversations: 0, email_campaigns_90d: 0, banner_projects: 0, open_tasks: 0 }
      : c.id === fixtureClientId(2)
        ? { spend_rows: 4, spend_last_synced_at: old, active_ad_connections: 1, inactive_ad_connections: 0, lead_rules_enabled: 1, leads_30d: 9, search_site_status: 'active', gsc_data_through: '2026-10-12', open_conversations: 2, email_campaigns_90d: 1, banner_projects: 3, open_tasks: 5 }
        : { spend_rows: 2, spend_last_synced_at: recent, active_ad_connections: 1, inactive_ad_connections: 0, lead_rules_enabled: 1, leads_30d: 0 } }
  }
  it('pages 120 active clients completely and never returns inactive ones', async () => {
    const fake = install(makeFixtureClients(120, 7), inventoryHandlers)
    const seen: string[] = []
    let cursor: string | undefined
    const pages: any[] = []
    do {
      const data: any = await reads.readDepartmentClientInventory(departmentReadContext(), { limit: 50, cursor }, deps)
      pages.push(data)
      seen.push(...data.clients.map((c: any) => c.clientId))
      cursor = data.page.nextCursor ?? undefined
    } while (cursor)
    expect(pages.map(p => p.clients.length)).toEqual([50, 50, 20])
    expect(pages.map(p => p.page.hasMore)).toEqual([true, true, false])
    expect(new Set(seen).size).toBe(120)
    expect(seen).not.toContain(fixtureClientId(121))
    expect(pages[0].coverage).toMatchObject({ totalActiveClients: 120, withCurrentSpend: 119 })
    for (const call of fake.calls) expect(call.sql).toContain('c.is_active = true')
    expect(pages[0]).toMatchObject({ source: 'stored_records', providerRefresh: false, period: '2026-10', timezone: 'Australia/Melbourne' })
  })
  it('distinguishes not configured, stale and reporting instead of zeros', async () => {
    install(makeFixtureClients(3), inventoryHandlers)
    const data: any = await reads.readDepartmentClientInventory(departmentReadContext(), {}, deps)
    const [one, two, three] = data.clients
    expect(one.paidMedia.status).toBe('not_configured')
    expect(one.missing).toEqual(expect.arrayContaining(['paid_media_not_configured', 'lead_routing_not_configured', 'search_not_configured']))
    expect(two.paidMedia.status).toBe('stale')
    expect(two.missing).toContain('paid_media_stale')
    expect(three.paidMedia).toMatchObject({ status: 'reporting', spendLines: 2, lastSyncedAt: recent })
    expect(three.search.status).toBe('not_configured')
  })
  it('rejects a forged cursor', async () => {
    install(makeFixtureClients(3), inventoryHandlers)
    await expect(reads.readDepartmentClientInventory(departmentReadContext(), { cursor: 'bm90LWpzb24' }, deps)).rejects.toMatchObject({ statusCode: 400 })
    const offset = Buffer.from(JSON.stringify({ k: 'offset', o: 3 })).toString('base64url')
    await expect(reads.readDepartmentClientInventory(departmentReadContext(), { cursor: offset }, deps)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('budget health and forecast', () => {
  const line = (over: Record<string, unknown>) => ({ platform: 'meta', currency: 'AUD', budget: 1000, spend: 400, line_count: 2, budgeted_line_count: 2, last_synced_at: recent, oldest_synced_at: recent, spend_as_of: '2026-10-14', stale_line_count: 0, ...over })
  const handlers: Handlers = {
    'dept:budget:page': { perClient: (c) => {
      const n = Number(c.id.slice(-3))
      if (n === 1) return line({ spend: 1200 })
      if (n === 2) return [line({ budget: 0, budgeted_line_count: 0 }), line({ platform: 'google_ads', currency: 'NZD', spend: 900 })]
      if (n === 3) return line({ last_synced_at: old, oldest_synced_at: old, stale_line_count: 2 })
      if (n === 4) return line({ budgeted_line_count: 1 })
      if (n === 5) return line({ spend: 100, spend_as_of: '2026-10-14' })
      return { platform: null }
    } },
    'dept:budget:totals': { whole: () => [{ currency: 'AUD', budget: 5000, spend: 3100, client_count: 5 }, { currency: 'NZD', budget: 1000, spend: 900, client_count: 1 }] }
  }
  it('classifies rows honestly and never sums across currencies', async () => {
    const fake = install(makeFixtureClients(6), handlers)
    const data: any = await reads.readDepartmentBudgetHealth(departmentReadContext(), {}, deps)
    const byId = (n: number) => data.clients.find((c: any) => c.clientId === fixtureClientId(n))
    expect(byId(1).lines[0].status).toBe('over_budget')
    expect(byId(2).lines.map((l: any) => l.status)).toEqual(['no_budget_set', 'projected_over'])
    expect(byId(2).lines[0].pacing).toBeNull()
    expect(byId(3).lines[0]).toMatchObject({ status: 'stale_data', pacing: null, forecast: null })
    expect(byId(4).lines[0]).toMatchObject({ status: 'partial_budget_coverage', pacing: null })
    expect(byId(5).lines[0].status).toBe('projected_under')
    expect(byId(6)).toMatchObject({ status: 'no_spend_data', lines: [] })
    expect(data.totalsByCurrency).toEqual([{ currency: 'AUD', budget: 5000, spend: 3100, clientCount: 5 }, { currency: 'NZD', budget: 1000, spend: 900, clientCount: 1 }])
    expect(data).not.toHaveProperty('totals')
    const sql = fake.calls.map(c => c.sql).join('\n')
    expect(sql).not.toMatch(/commission|revenue|xero|customer_finance/i)
    expect(fake.calls.find(c => c.label === 'dept:budget:page')!.params).toContain('2026-10')
  })
  it('forecast names its method and uses spend-as-of days', async () => {
    install(makeFixtureClients(1), handlers)
    const data: any = await reads.readDepartmentBudgetHealth(departmentReadContext(), {}, deps)
    const meta = data.clients[0].lines[0]
    expect(meta.forecast).toMatchObject({ method: 'linear_run_rate_to_spend_as_of', daysElapsed: 14, daysInPeriod: 31 })
    expect(meta.forecast.projectedSpend).toBeCloseTo(1200 / 14 * 31, 2)
    expect(meta.pacing.expectedSpendToDate).toBeCloseTo(1000 * 14 / 31, 2)
    expect(data.planBasis).toBe('linear_calendar_month_no_time_phased_plan_stored')
  })
  it('a closed period reports actuals without projecting', async () => {
    install(makeFixtureClients(1), handlers)
    const data: any = await reads.readDepartmentBudgetHealth(departmentReadContext(), { period: '2026-09' }, deps)
    expect(data.periodClosed).toBe(true)
    expect(data.clients[0].lines[0].forecast).toMatchObject({ method: 'period_closed_actuals', projectedSpend: 1200 })
  })
})

describe('lead quality and routing', () => {
  it('reports aggregates only, null ratios on zero denominators and routing failures', async () => {
    const fake = install(makeFixtureClients(2), { 'dept:leads:page': { perClient: c => c.id === fixtureClientId(1)
      ? { total: 10, new_count: 3, contacted: 2, qualified: 3, won: 1, lost: 0, spam: 1, uncontacted_over_24h: 2, last_lead_at: recent, by_source: { meta: 7, google: 3 }, rules_enabled: 1, rules_without_destination: 0, delivered: 8, failed: 2, pending_overdue: 1, failed_by_type: { webhook: 2 } }
      : { total: 0, rules_enabled: 0, rules_without_destination: 0 } } })
    const data: any = await reads.readDepartmentLeadQuality(departmentReadContext(), { days: '30d' }, deps)
    const [a, b] = data.clients
    expect(a.leads).toMatchObject({ total: 10, qualified: 4, qualifiedRate: 0.4444, spamRate: 0.1, uncontactedOver24h: 2 })
    expect(a.routing).toMatchObject({ status: 'failing', deliveries: { delivered: 8, failed: 2, pendingOverdue: 1 }, failedByDestination: { webhook: 2 } })
    expect(a.costPerQualifiedLead.status).toBe('unavailable')
    expect(b.leads).toMatchObject({ total: 0, qualifiedRate: null, spamRate: null })
    expect(b.routing.status).toBe('not_configured')
    const sql = fake.calls.find(c => c.label === 'dept:leads:page')!.sql
    expect(sql).toContain('l.is_test = false')
    expect(sql).toContain('l.deleted_at IS NULL')
    expect(sql).not.toMatch(/field_data|notes|last_error|response_meta|raw_payload|attribution|\bconfig\b/)
    expect(JSON.stringify(data)).not.toMatch(/@|phone/i)
    expect(data.window).toMatchObject({ days: 30, from: '2026-09-16' })
  })
})

describe('seo and content', () => {
  it('reports stored GSC totals, never sums overlapping properties and flags missing setup', async () => {
    install(makeFixtureClients(3), { 'dept:seo:page': { perClient: (c) => {
      const n = Number(c.id.slice(-3))
      if (n === 1) return { site_status: 'active', hostname: 'a.example', property_count: 1, data_through: '2026-10-12', last_sync_status: 'succeeded', last_sync_completed_at: recent, property_perf: [{ propertyMapId: 'p1', clicks: 50, impressions: 1000, weightedPosition: 8.25, daysWithData: 28, provisionalDays: 2 }], open_opportunities: 4, top_opportunities: [{ id: 'o1', type: 'low_ctr', title: 'Fix title', score: 90, status: 'new', pageUrl: 'https://a.example/x', lastDetectedAt: recent }], content_by_status: { draft: 2 } }
      if (n === 2) return { site_status: 'active', hostname: 'b.example', property_count: 2, data_through: '2026-10-01', last_sync_status: 'failed', last_sync_completed_at: old, property_perf: [{ propertyMapId: 'p2', clicks: 5, impressions: 100 }, { propertyMapId: 'p3', clicks: 4, impressions: 90 }], open_opportunities: 0, top_opportunities: [], content_by_status: null }
      return { site_status: null }
    } } })
    const data: any = await reads.readDepartmentSeoOverview(departmentReadContext(), { days: '28d' }, deps)
    const [a, b, c] = data.clients
    expect(a).toMatchObject({ status: 'reporting', performanceBasis: 'single_property', performance: { clicks: 50, impressions: 1000, ctr: 0.05, weightedPosition: 8.25 } })
    expect(a.opportunities.top[0]).toMatchObject({ title: 'Fix title', score: 90 })
    expect(b).toMatchObject({ status: 'sync_failed', performanceBasis: 'multiple_properties_not_summed', performance: null })
    expect(b.perProperty).toHaveLength(2)
    expect(c).toMatchObject({ status: 'not_configured', performance: null })
    expect(data.metricNotes.position).toMatch(/diagnostic/)
  })
})

describe('inbox and email statistics', () => {
  it('computes rates from compatible totals and excludes message bodies and recipients', async () => {
    const fake = install(makeFixtureClients(2), { 'dept:inbox:page': { perClient: c => c.id === fixtureClientId(1)
      ? { conversations: 12, open_count: 4, open_breached: 1, awaiting_reply: 2, oldest_awaiting_at: old, created_in_window: 6, responded_in_window: 5, avg_first_response_minutes: 42.5, last_message_at: recent, campaigns: 3, sent_campaigns: 2, in_flight: 1, drafts: 0, sent: 1000, delivered: 950, opened: 300, clicked: 40, bounced: 50, complained: 1, unsubscribed: 5, last_finished_at: recent }
      : { conversations: 0, campaigns: 0, sent_campaigns: 0, sent: 0, delivered: 0 } } })
    const data: any = await reads.readDepartmentInboxEmailStats(departmentReadContext(), {}, deps)
    const [a, b] = data.clients
    expect(a.socialInbox).toMatchObject({ status: 'reporting', open: 4, openSlaBreached: 1, awaitingReply: 2, avgFirstResponseMinutes: 42.5 })
    expect(a.email.rates).toMatchObject({ delivery: 0.95, bounce: 0.05, click: 0.0421, unsubscribe: 0.0053, complaint: 0.0011 })
    expect(b.socialInbox.status).toBe('not_configured')
    expect(b.email).toMatchObject({ status: 'not_configured', rates: { delivery: null, bounce: null, click: null } })
    const sql = fake.calls.find(c => c.label === 'dept:inbox:page')!.sql
    expect(sql).not.toMatch(/preview|participant|body_html|body_source|from_email|reply_to|subject|email_recipients|recipient/)
    expect(data.metricNotes.opens).toMatch(/not a business outcome/i)
  })
})

describe('creative inventory and work coverage', () => {
  it('counts creative stock and overdue proofs per active client', async () => {
    const fake = install(makeFixtureClients(1, 1), { 'dept:creative:page': { perClient: () => ({ banner_projects: 3, banner_in_review: 1, banner_by_status: { draft: 2, published: 1 }, banner_last_updated_at: recent, video_assets: 2, video_last_created_at: recent, brand_kits: 1, open_proofs: 2, overdue_proofs: 1, proof_by_status: { client_review: 2 } }) } })
    const data: any = await reads.readDepartmentCreativeInventory(departmentReadContext(), {}, deps)
    expect(data.clients).toHaveLength(1)
    expect(data.clients[0]).toMatchObject({ banners: { total: 3, inReview: 1, byStatus: { draft: 2, published: 1 } }, video: { assets: 2 }, brandKits: 1, proofs: { open: 2, overdue: 1 } })
    expect(fake.calls.find(c => c.label === 'dept:creative:page')!.sql).not.toMatch(/access_password|r2_key|share_token/)
  })
  it('reports task and brief coverage plus bounded assignee workload without payroll fields', async () => {
    const fake = install(makeFixtureClients(2), {
      'dept:work:page': { perClient: () => ({ open_tasks: 5, overdue_tasks: 2, blocked_tasks: 1, unassigned_open: 1, due_soon: 2, oldest_overdue_due: '2026-10-01', open_briefs: 3, briefs_awaiting_review: 1, briefs_past_deadline: 1, unassigned_open_briefs: 0, brief_by_status: { submitted: 1, in_progress: 2 } }) },
      'dept:work:assignees': { whole: () => Array.from({ length: 26 }, (_, i) => ({ assignee_id: i ? `tm-${i}` : null, assignee_name: i ? `Person ${i}` : null, open_tasks: 30 - i, overdue_tasks: 1, client_count: 2 })) }
    })
    const data: any = await reads.readDepartmentWorkCoverage(departmentReadContext(), {}, deps)
    expect(data.clients[0]).toMatchObject({ tasks: { open: 5, overdue: 2, blocked: 1, unassigned: 1, dueSoon: 2 }, briefs: { open: 3, awaitingReview: 1, pastDeadline: 1 } })
    expect(data.workload.assignees).toHaveLength(25)
    expect(data.workload.hasMore).toBe(true)
    expect(data.workload.assignees[0]).toMatchObject({ assigneeId: null, name: 'Unassigned' })
    const sql = fake.calls.map(c => c.sql).join('\n')
    expect(sql).not.toMatch(/hourly_rate|salary|pay_rate|time_entries|cost_rate|labor_cost/)
    expect(fake.calls.find(c => c.label === 'dept:work:assignees')!.sql).toContain('JOIN scoped s ON s.id = pj.client_id')
  })
})

describe('daily portfolio brief', () => {
  const signals = (over: Record<string, unknown>) => ({ spend_lines: 3, over_budget_lines: 0, spend_oldest_synced_at: recent, inactive_ad_connections: 0, failed_deliveries: 0, pending_overdue_deliveries: 0, uncontacted_new_leads: 0, open_sla_breaches: 0, overdue_tasks: 0, blocked_tasks: 0, briefs_awaiting_review: 0, briefs_past_deadline: 0, overdue_proofs: 0, gsc_failed_properties: 0, ...over })
  const handlers: Handlers = { 'dept:brief:signals': { perClient: (c) => {
    const n = Number(c.id.slice(-3))
    if (n === 1) return signals({ over_budget_lines: 2, failed_deliveries: 3 })
    if (n === 2) return signals({ spend_oldest_synced_at: old, overdue_tasks: 4 })
    if (n === 3) return signals({ spend_lines: 0, spend_oldest_synced_at: null })
    return signals({})
  } } }
  it('covers every active client and ranks exceptions without inventing owners or outcomes', async () => {
    const fake = install(makeFixtureClients(5, 2), handlers)
    const data: any = await reads.readDepartmentDailyBrief(departmentReadContext(), {}, deps)
    expect(data.coverage).toMatchObject({ totalActiveClients: 5, evaluatedClients: 5, complete: true, clientsWithExceptions: 2, clientsWithoutPaidMedia: 1, clientsWithStalePaidMedia: 1 })
    expect(data.exceptions.map((e: any) => [e.clientId, e.signal, e.severity])).toEqual([
      [fixtureClientId(1), 'lead_deliveries_failed', 'high'],
      [fixtureClientId(1), 'over_budget', 'high'],
      [fixtureClientId(2), 'overdue_tasks', 'medium'],
      [fixtureClientId(2), 'paid_media_stale', 'medium']
    ])
    for (const e of data.exceptions) {
      expect(e.owner).toBeNull()
      expect(typeof e.nextAction).toBe('string')
    }
    expect(fake.calls.find(c => c.label === 'dept:brief:signals')!.params).toContain(1001)
  })
  it('paginates exceptions and reports an incomplete portfolio pass above the cap', async () => {
    install(makeFixtureClients(1002), { 'dept:brief:signals': { perClient: () => signals({ overdue_tasks: 1 }) } })
    const first: any = await reads.readDepartmentDailyBrief(departmentReadContext(), { limit: 10 }, deps)
    expect(first.coverage).toMatchObject({ totalActiveClients: 1002, evaluatedClients: 1000, complete: false })
    expect(first.page).toMatchObject({ total: 1000, returned: 10, hasMore: true })
    const second: any = await reads.readDepartmentDailyBrief(departmentReadContext(), { limit: 10, cursor: first.page.nextCursor }, deps)
    expect(second.exceptions[0].clientId).not.toBe(first.exceptions[0].clientId)
  })
})

describe('read-only contract', () => {
  it('every department read is SELECT-only, fresh, and never touches internal routes or writes', async () => {
    const fake = install(makeFixtureClients(2), new Proxy({}, { get: (_, key: string) => key.endsWith(':coverage') || key.endsWith(':totals') || key.endsWith(':assignees') ? { whole: () => [] } : { perClient: () => ({}) } }) as Handlers)
    const ctx = departmentReadContext()
    await reads.readDepartmentClientInventory(ctx, {}, deps)
    await reads.readDepartmentDailyBrief(ctx, {}, deps)
    await reads.readDepartmentBudgetHealth(ctx, {}, deps)
    await reads.readDepartmentLeadQuality(ctx, {}, deps)
    await reads.readDepartmentSeoOverview(ctx, {}, deps)
    await reads.readDepartmentInboxEmailStats(ctx, {}, deps)
    await reads.readDepartmentCreativeInventory(ctx, {}, deps)
    await reads.readDepartmentWorkCoverage(ctx, {}, deps)
    expect(new Set(fake.calls.map(c => c.label)).size).toBeGreaterThanOrEqual(10)
    for (const call of fake.calls) {
      expect(call.sql).toMatch(/^\/\* dept:[a-z_]+:[a-z_]+ \*\/\s*WITH /)
      expect(call.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|GRANT|pg_sleep|nextval)\b/i)
    }
    expect(db.execute).not.toHaveBeenCalled()
    expect(db.queryRows).not.toHaveBeenCalled()
    expect(db.queryOne).not.toHaveBeenCalled()
    expect(internal.aiInternalFetch).not.toHaveBeenCalled()
  })
})

describe('tool definitions', () => {
  it('exports eight read-only strict tools with bounded inputs', async () => {
    expect(departmentReadTools.map(t => t.name)).toEqual([
      'get_department_client_inventory', 'get_department_daily_brief', 'get_department_budget_health', 'get_department_lead_quality',
      'get_department_seo_overview', 'get_department_inbox_email_stats', 'get_department_creative_inventory', 'get_department_work_coverage'
    ])
    for (const t of departmentReadTools) {
      expect(t.mutates).not.toBe(true)
      expect(t.directMutation).toBeUndefined()
      expect(t.parameters.safeParse({ limit: 51 }).success).toBe(false)
      expect(t.parameters.safeParse({ sql: 'select 1' }).success).toBe(false)
      expect(t.parameters.safeParse({}).success).toBe(true)
    }
  })
  it('tool handler runs through the fresh boundary and returns typed data', async () => {
    install(makeFixtureClients(1), { 'dept:creative:page': { perClient: () => ({ banner_projects: 1 }) } })
    staff.resolveMcpStaffContext.mockResolvedValue(departmentReadContext())
    const tool = departmentReadTools.find(t => t.name === 'get_department_creative_inventory')!
    const result: any = await tool.handler(tool.parameters.parse({}), departmentReadContext())
    expect(result.ok).toBe(true)
    expect(result.data.clients[0].banners.total).toBe(1)
    const noRead: any = await tool.handler({}, departmentReadContext({ mcpScopes: new Set() }))
    expect(noRead).toMatchObject({ ok: false, code: 'DEPARTMENT_ACCESS_DENIED' })
  })
})
