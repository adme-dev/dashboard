import { expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ queryRowsFresh: vi.fn(async () => []) }))
vi.mock('~~/server/utils/db', () => ({ ...db, queryOneFresh: vi.fn() }))
import { readCreativeText } from '../../server/utils/ai/marketing/creativeReads'
it('creative_identity_and_scope_precede_source_cap', async () => {
  await readCreativeText({ clientIds: ['a'], permissionGroups: [], reportingGranted: true } as any, { platform: 'meta', campaignId: 'same' })
  const [sql, params] = db.queryRowsFresh.mock.calls[0]
  expect(sql).toMatch(/DISTINCT ON \(ms.client_id, ms.platform, ms.connection_id/)
  expect(sql).toMatch(/WHERE[\s\S]*ms.client_id = ANY[\s\S]*LIMIT/)
  expect(params).toContainEqual(['a'])
})
