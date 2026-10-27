import { beforeEach, expect, it, vi } from 'vitest'
import { readCampaignAnalytics } from '../../server/utils/ai/marketing/campaignReads'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))

const scope: any = { actorUserId: 'staff', clientIds: ['a'], permissionGroups: [], reportingGranted: true, ownerVerified: false, financialReadAllowed: false, ownerRefreshAllowed: false }
const query: any = { startDate: '2026-10-01', endDate: '2026-10-27', showInactive: true, sortBy: 'spend', sortDir: 'DESC', limit: 200, offset: 0 }
beforeEach(() => {
  vi.clearAllMocks()
  db.queryOneFresh.mockResolvedValue({ count: 0 })
  db.queryRowsFresh.mockResolvedValue([])
})
it('campaign_count_and_rows_scope_before_group_limit', async () => {
  await readCampaignAnalytics(scope, query)
  const sql = db.queryRowsFresh.mock.calls[0][0]
  expect(sql).toMatch(/WITH scoped_media AS[\s\S]*ms.client_id = ANY[\s\S]*daily AS/)
  expect(sql).toContain('JOIN scoped_media ms ON ms.id = ds.media_spend_id')
  expect(sql).toContain('l.client_id = c.client_id')
  expect(db.queryRowsFresh.mock.calls[0][1]).toContainEqual(['a'])
})
it('conflicting_connection_map_does_not_expand_canonical_scope', async () => {
  await readCampaignAnalytics(scope, { ...query, clientId: 'a' })
  const sql = db.queryRowsFresh.mock.calls[0][0]
  expect(sql).toMatch(/ms.client_id = \$\d/)
  expect(sql).not.toContain('sc.client_id')
})
it('campaign_name_fallback_account_collision_is_ambiguous_before_limit', async () => {
  await readCampaignAnalytics(scope, { ...query, search: 'one-account-name' })
  const [sql] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toContain('FROM authorized_media am')
  expect(sql).toContain('c.campaign_id IS NULL AND am.campaign_name = c.campaign_name')
  const authorityCte = sql.slice(sql.indexOf('authorized_media AS'), sql.indexOf('daily AS'))
  expect(authorityCte).not.toContain('ILIKE')
})
it('client_lead_totals_deduplicate_ambiguous_accounts', async () => {
  const { readLeadAttribution } = await import('../../server/utils/ai/marketing/campaignReads')
  db.queryOneFresh.mockResolvedValue({ total_submissions: 1, campaign_attributed: 1, ad_attributed: 1, account_ambiguous: true })
  const result = await readLeadAttribution(scope, { ...query, campaignName: 'Same' })
  expect(result).toMatchObject({ totalSubmissions: 1, accountAttributionStatus: 'ambiguous' })
  const [sql] = db.queryOneFresh.mock.calls[0]
  expect(sql).toContain('COUNT(DISTINCT l.id)')
  expect(sql).toContain('matched.client_id = l.client_id')
  expect(sql).toContain('l.source = CASE')
})
