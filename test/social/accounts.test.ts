import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>; params?: Record<string, string> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockRequireSocialClientAccess = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a),
  transaction: async (callback: (db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
    return await callback({
      query: async (sql: string, params?: unknown[]) => {
        if (/^\s*SELECT/i.test(sql)) {
          const row = await mockQueryOne(sql, params)
          return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
        }
        const rowCount = await mockExecute(sql, params)
        return { rows: [], rowCount }
      }
    })
  }
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a),
}))

const { default: listHandler } = await import('../../server/api/agency/social/publishing/accounts/index.get')
const { default: deleteHandler } = await import('../../server/api/agency/social/publishing/accounts/[id].delete')

describe('publishing accounts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'U1' })
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue(1)
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('lists accounts for a client with connection health and never selects the raw token', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'a1',
      client_id: 'C1',
      platform: 'facebook',
      platform_account_id: 'PAGE1',
      account_name: 'Page',
      is_active: true,
      last_error: null,
      token_expires_at: '2026-07-01T00:00:00.000Z',
      last_synced_at: null,
      metadata: { webhook_subscribed: true },
      created_at: '2026-06-30T00:00:00.000Z',
      has_refresh_token: false,
      linked_facebook_account_id: null,
      linked_facebook_account_name: null,
      linked_facebook_is_active: null,
    }])
    const res = await listHandler({ query: { clientId: 'C1' } } as any)
    expect(res).toMatchObject([{
      id: 'a1',
      platform: 'facebook',
      has_refresh_token: false,
      connection_health: 'reconnect',
      connection_health_label: 'Reconnect required',
      requires_reconnect: true,
    }])
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    const sql = mockQueryRows.mock.calls[0][0] as string
    expect(sql).toContain('FROM social_accounts')
    expect(sql).toContain('has_refresh_token')
    expect(sql).toContain('linked_fb')
    expect(sql).not.toMatch(/\baccess_token\b/)
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['C1'])
  })

  it('requires clientId', async () => {
    await expect(listHandler({ query: {} } as any)).rejects.toThrow('clientId required')
  })

  it('deletes an account by id after CREATIVE and client-access checks', async () => {
    mockQueryOne.mockResolvedValue({
      client_id: 'C1',
      platform: 'linkedin',
      platform_account_id: 'P1',
      access_token: null,
      metadata: {},
    })
    const res = await deleteHandler({ params: { id: 'a1' } } as any)
    expect(res).toEqual({ ok: true })
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner'])
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM social_accounts WHERE id = $1 AND client_id = $2', ['a1', 'C1'])
  })

  it('404s when deleting a missing account', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(deleteHandler({ params: { id: 'missing' } } as any)).rejects.toThrow('Account not found')
  })

  it('best-effort unsubscribes the Meta webhook before deleting a subscribed facebook page', async () => {
    mockQueryOne.mockResolvedValue({ client_id: 'C1', platform: 'facebook', platform_account_id: 'P1', access_token: 'PT', metadata: { webhook_subscribed: true } })
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    g.fetch = fetchSpy
    await deleteHandler({ params: { id: 'a1' } } as any)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/P1/subscribed_apps')
    expect(init.method).toBe('DELETE')
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM social_accounts WHERE id = $1 AND client_id = $2', ['a1', 'C1'])
  })

  it('does not call the Graph API when the page was never webhook-subscribed', async () => {
    mockQueryOne.mockResolvedValue({ client_id: 'C1', platform: 'facebook', platform_account_id: 'P1', access_token: 'PT', metadata: {} })
    const fetchSpy = vi.fn()
    g.fetch = fetchSpy
    await deleteHandler({ params: { id: 'a1' } } as any)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), 'C1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
