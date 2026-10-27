import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ queryRowsFresh: vi.fn(), queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
import { resolveScopedSearchTermTarget, readScopedSearchTermSnapshot } from '../../server/utils/ai/marketing/searchTermReads'
const scope: any = { clientIds: ['a'], permissionGroups: [], reportingGranted: true }
beforeEach(() => vi.clearAllMocks())
it('search_target_ambiguity_ignores_forbidden_matches', async () => {
  db.queryRowsFresh.mockResolvedValue([{ id: 'm', client_id: 'a', platform: 'google_ads', campaign_id: 'same', connection_id: 'c' }, { id: 'm2', client_id: 'a', platform: 'google_ads', campaign_id: 'same', connection_id: 'c2' }])
  await expect(resolveScopedSearchTermTarget(scope, { campaignId: 'same' })).rejects.toThrow('Multiple')
  expect(db.queryRowsFresh.mock.calls[0][0]).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*LIMIT 2/)
})
it('staff_cannot_load_snapshot_with_forged_target', async () => {
  db.queryOneFresh.mockResolvedValue(null)
  expect(await readScopedSearchTermSnapshot(scope, { clientId: 'b', campaignId: 'same', platform: 'google', connectionId: 'c' } as any, '2026-10-01', '2026-10-27')).toBeNull()
  expect(db.queryOneFresh.mock.calls[0][0]).toMatch(/JOIN media_spend ms[\s\S]*ms.client_id = ANY/)
  expect(db.queryRowsFresh).not.toHaveBeenCalled()
})
it.each(['current', 'prior'])('older_month_exact_window_is_read_without_sync %s', async window => {
  db.queryOneFresh.mockResolvedValue({ id: 'older-sync', coverage: 'full', synced_at: '2026-10-27', source_total: 1 })
  db.queryRowsFresh.mockResolvedValue([{ search_term: 'stored', cost: 5, clicks: 1 }])
  const result = await readScopedSearchTermSnapshot(scope, { clientId: 'a', platform: 'google', connectionId: 'c', campaignId: 'same', mediaSpendId: 'new-month' }, window === 'current' ? '2026-10-01' : '2026-09-01', window === 'current' ? '2026-10-27' : '2026-09-27')
  expect(result?.terms[0].searchTerm).toBe('stored')
  expect(db.queryOneFresh.mock.calls[0][1]).not.toContain('new-month')
  expect(db.queryRowsFresh.mock.calls[0][1].at(-1)).toBe('older-sync')
})
it('duplicate_monthly_windows_choose_deterministic_snapshot_without_summing', async () => {
  db.queryOneFresh.mockResolvedValue(null)
  await readScopedSearchTermSnapshot(scope, { clientId: 'a', platform: 'google', connectionId: 'c', campaignId: 'same' }, '2026-10-01', '2026-10-27')
  const [sql] = db.queryOneFresh.mock.calls[0]
  expect(sql).toContain("sync.coverage IN ('full', 'limited')")
  expect(sql).toContain('COALESCE(sync.synced_at, sync.last_attempted_at) DESC NULLS LAST, sync.id ASC LIMIT 1')
  expect(sql).not.toContain('SUM(')
})
