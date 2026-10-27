import { beforeEach, expect, it, vi } from 'vitest'
import { readAdSnapshots, selectScopedAdTargets } from '../../server/utils/ai/marketing/adReads'

const db = vi.hoisted(() => ({ queryRowsFresh: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/onDemandSync', () => ({ syncCampaignAdPerformance: vi.fn(() => {
  throw Error('provider forbidden')
}) }))

const scope: any = { clientIds: ['a'], permissionGroups: [], reportingGranted: true }
const args: any = { campaignId: 'same', startDate: '2026-10-01', endDate: '2026-10-27' }
const target = { clientId: 'a', platform: 'meta', connectionId: 'conn', campaignId: 'same', mediaSpendId: 'new-month' }
beforeEach(() => vi.clearAllMocks())
it('scope_precedes_ad_target_and_creative_caps', async () => {
  db.queryRowsFresh.mockResolvedValue([])
  await selectScopedAdTargets(scope, args)
  const [sql, values] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*LIMIT 21/)
  expect(values).toContainEqual(['a'])
})
it('older_month_exact_window_is_read_without_sync', async () => {
  db.queryRowsFresh.mockResolvedValue([{ client_id: 'a', platform: 'meta', connection_id: 'conn', campaign_id: 'same', ad_id: 'ad', media_spend_id: 'older-month', spend: 3 }])
  const result = await readAdSnapshots(scope, [target], args.startDate, args.endDate)
  expect(result.snapshotCoverage.missingTargetCount).toBe(0)
  const [sql] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toMatch(/DISTINCT ON[\s\S]*aps.synced_at DESC NULLS LAST, aps.id ASC/)
  expect(sql).toContain('ms.connection_id IS NOT DISTINCT FROM selected.connection_id')
  expect(sql).not.toContain('aps.media_spend_id = ANY')
})
it('fresh_and_missing_campaign_snapshots_halt_with_explicit_coverage', async () => {
  db.queryRowsFresh.mockResolvedValue([])
  const result = await readAdSnapshots(scope, [target], args.startDate, args.endDate)
  expect(result.snapshotCoverage).toMatchObject({ selectedTargetCount: 1, missingTargetCount: 1, withSnapshotCount: 0 })
})
it('ad_account_ambiguity_is_checked_before_target_cap', async () => {
  db.queryRowsFresh.mockResolvedValue([])
  await readAdSnapshots(scope, [target], args.startDate, args.endDate)
  const [sql] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toContain('FROM scoped_media other')
  expect(sql).toContain('other.client_id = l.client_id')
  expect(sql).not.toMatch(/FROM selected other/)
})
it.each(['current', 'prior'])('duplicate_monthly_windows_choose_deterministic_snapshot_without_summing %s', async (window) => {
  db.queryRowsFresh.mockResolvedValue([])
  await readAdSnapshots(scope, [target], window === 'current' ? '2026-10-01' : '2026-09-01', window === 'current' ? '2026-10-27' : '2026-09-27')
  const [sql] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toContain('DISTINCT ON (ms.client_id, ms.reporting_platform, ms.connection_id, ms.campaign_id, aps.ad_id)')
  expect(sql).toContain('aps.synced_at DESC NULLS LAST, aps.id ASC')
  expect(sql).not.toContain('SUM(aps.')
})
it('reassigned_older_month_snapshot_is_inaccessible', async () => {
  db.queryRowsFresh.mockResolvedValue([])
  const result = await readAdSnapshots(scope, [{ ...target, clientId: 'b' }], args.startDate, args.endDate)
  expect(result.snapshotCoverage.missingTargetCount).toBe(1)
  const [sql, params] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toContain('JOIN scoped_media ms ON ms.id = aps.media_spend_id')
  expect(sql).toContain('ms.client_id IS NOT DISTINCT FROM selected.client_id')
  expect(params).toContainEqual(['a'])
})
