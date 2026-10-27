import { expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(async () => []) }))
vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
import { readSpendSummary } from '../../server/utils/ai/marketing/spendReads'
it('pacing_groups_only_assigned_rows_and_never_reads_finance_or_jobs', async () => {
  const result = await readSpendSummary({ clientIds: ['a'], permissionGroups: [], reportingGranted: true } as any, { month: 10, year: 2026 })
  expect(result.projection).toBe('marketing')
  expect(result.totals).not.toHaveProperty('commission')
  expect(db.queryOneFresh).not.toHaveBeenCalled()
  const sql = db.queryRowsFresh.mock.calls[0][0]
  expect(sql).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*GROUP BY/)
  expect(sql).not.toMatch(/commission|customer_finance|team_members|spend_sync_jobs|xero_contact/)
})
