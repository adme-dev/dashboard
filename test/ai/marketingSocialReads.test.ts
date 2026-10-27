import { expect, it, vi } from 'vitest'
import { readSocialOverview } from '../../server/utils/ai/marketing/socialReads'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(async () => []) }))
vi.mock('~~/server/utils/db', () => db)

it('unassigned_social_client_never_reaches_portal_queries', async () => {
  db.queryOneFresh.mockResolvedValue(null)
  await expect(readSocialOverview({ clientIds: ['a'], permissionGroups: [], reportingGranted: true } as any, { clientId: 'b', from: '2026-10-01', to: '2026-10-27' })).rejects.toThrow('Client not found')
  expect(db.queryRowsFresh).not.toHaveBeenCalled()
})
it('social_current_prior_growth_require_same_authorized_client', async () => {
  db.queryOneFresh.mockResolvedValue({ id: 'a' })
  await readSocialOverview({ clientIds: ['a'], permissionGroups: [], reportingGranted: true } as any, { clientId: 'a', from: '2026-10-01', to: '2026-10-27' })
  expect(db.queryRowsFresh.mock.calls.length).toBeGreaterThanOrEqual(3)
  for (const [sql, params] of db.queryRowsFresh.mock.calls) {
    expect(params[0]).toBe('a')
    expect(sql).toContain('client_id')
  }
})
