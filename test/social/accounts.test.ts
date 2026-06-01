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
const mockExecute = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
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
})
