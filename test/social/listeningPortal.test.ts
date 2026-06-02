import { describe, it, expect, vi } from 'vitest'
import { portalListMentions, portalOverviewRows } from '~~/server/utils/socialListening/portal'

describe('socialListening portal — tenant isolation', () => {
  it('portalListMentions scopes to the passed clientId (never caller input)', async () => {
    const db = { queryRows: vi.fn(async () => []) }
    await portalListMentions(db as any, 'client-123', { limit: 50 })
    const [, params] = db.queryRows.mock.calls[0]
    expect(params[0]).toBe('client-123')
  })
  it('portalOverviewRows scopes to clientId and clamps days', async () => {
    const db = { queryRows: vi.fn(async () => []) }
    await portalOverviewRows(db as any, 'client-123', 9999)
    const [sql, params] = db.queryRows.mock.calls[0]
    expect(sql).toContain('client_id = $1')
    expect(params[0]).toBe('client-123')
    expect(params[1]).toBeLessThanOrEqual(365)
  })
})
