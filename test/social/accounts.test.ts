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

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a),
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
  })

  it('lists accounts for a client and never selects the raw token', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'a1', platform: 'facebook' }])
    const res = await listHandler({ query: { clientId: 'C1' } } as any)
    expect(res).toEqual([{ id: 'a1', platform: 'facebook' }])
    const sql = mockQueryRows.mock.calls[0][0] as string
    expect(sql).toContain('FROM social_accounts')
    expect(sql).not.toMatch(/\baccess_token\b/)
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['C1'])
  })

  it('requires clientId', async () => {
    await expect(listHandler({ query: {} } as any)).rejects.toThrow('clientId required')
  })

  it('deletes an account by id after CREATIVE check', async () => {
    const res = await deleteHandler({ params: { id: 'a1' } } as any)
    expect(res).toEqual({ ok: true })
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner'])
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM social_accounts WHERE id = $1', ['a1'])
  })

  it('best-effort unsubscribes the Meta webhook before deleting a subscribed facebook page', async () => {
    mockQueryOne.mockResolvedValueOnce({ platform: 'facebook', platform_account_id: 'P1', access_token: 'PT', metadata: { webhook_subscribed: true } })
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    g.fetch = fetchSpy
    await deleteHandler({ params: { id: 'a1' } } as any)
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/P1/subscribed_apps')
    expect(init.method).toBe('DELETE')
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM social_accounts WHERE id = $1', ['a1'])
  })

  it('does not call the Graph API when the page was never webhook-subscribed', async () => {
    mockQueryOne.mockResolvedValueOnce({ platform: 'facebook', platform_account_id: 'P1', access_token: 'PT', metadata: {} })
    const fetchSpy = vi.fn()
    g.fetch = fetchSpy
    await deleteHandler({ params: { id: 'a1' } } as any)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
