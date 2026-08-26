import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryRows: (...args: unknown[]) => queryRows(...args) }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'u1' })) }))

const testGlobal = globalThis as typeof globalThis & { defineEventHandler: <T>(fn: T) => T }
testGlobal.defineEventHandler = fn => fn

describe('GET /api/agency/social/inbox/clients', () => {
  beforeEach(() => queryRows.mockReset())

  it('lists only clients with at least one active social account, alphabetically', async () => {
    const { default: handler } = await import('../../../server/api/agency/social/inbox/clients.get')
    queryRows.mockResolvedValueOnce([{ id: 'c1', name: 'Garry and Warren Smith', active_account_count: 4 }])
    const result = await handler({ context: {} } as never)
    expect(result).toEqual([{ id: 'c1', name: 'Garry and Warren Smith', active_account_count: 4 }])
    const sql = String(queryRows.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(sql).toContain('JOIN social_accounts a ON a.client_id = c.id AND a.is_active = TRUE')
    expect(sql).toContain('WHERE c.is_active = TRUE')
    expect(sql).toContain('ORDER BY c.name ASC')
  })
})
