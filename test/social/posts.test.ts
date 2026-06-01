import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>; params?: Record<string, string>; body?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
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

const { default: createH } = await import('../../server/api/agency/social/publishing/posts/index.post')
const { default: listH } = await import('../../server/api/agency/social/publishing/posts/index.get')
const { default: getH } = await import('../../server/api/agency/social/publishing/posts/[id]/index.get')
const { default: patchH } = await import('../../server/api/agency/social/publishing/posts/[id]/index.patch')
const { default: delH } = await import('../../server/api/agency/social/publishing/posts/[id]/index.delete')

describe('publishing posts CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'U1' })
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ id: 'P1' })
    mockExecute.mockResolvedValue(1)
  })

  it('creates a draft, serializing platform_overrides as jsonb', async () => {
    await createH({ body: { clientId: 'C1', content: 'hi', platforms: ['facebook'], platformOverrides: { instagram: { content: 'IG' } } } } as any)
    const [, params] = mockQueryOne.mock.calls[0]
    expect(params[0]).toBe('C1')           // client_id
    expect(params[1]).toBe('U1')           // created_by
    expect(params[9]).toBe(JSON.stringify({ instagram: { content: 'IG' } }))  // platform_overrides
  })

  it('rejects create without clientId', async () => {
    await expect(createH({ body: {} } as any)).rejects.toThrow('clientId required')
  })

  it('lists with optional status filter + bounded limit', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'P1' }])
    await listH({ query: { clientId: 'C1', status: 'scheduled', limit: '9999' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toContain('AND status = $2')
    expect(params).toEqual(['C1', 'scheduled', 500]) // limit clamped to 500
  })

  it('gets a post, 404 when missing', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(getH({ params: { id: 'P1' } } as any)).rejects.toThrow('Post not found')
  })

  it('patches only provided fields and serializes jsonb overrides', async () => {
    await patchH({ params: { id: 'P1' }, body: { content: 'new', platformOverrides: { linkedin: { content: 'LI' } } } } as any)
    const [sql, params] = mockQueryOne.mock.calls[0]
    expect(sql).toMatch(/content = \$1/)
    expect(sql).toMatch(/platform_overrides = \$2::jsonb/)
    expect(sql).toMatch(/updated_at = NOW\(\)/)
    expect(params[1]).toBe(JSON.stringify({ linkedin: { content: 'LI' } }))
    expect(params[2]).toBe('P1') // id is last param
  })

  it('rejects an empty patch', async () => {
    await expect(patchH({ params: { id: 'P1' }, body: {} } as any)).rejects.toThrow('No updatable fields')
  })

  it('deletes a post', async () => {
    const res = await delH({ params: { id: 'P1' } } as any)
    expect(res).toEqual({ ok: true })
    expect(mockExecute).toHaveBeenCalledWith('DELETE FROM social_posts WHERE id = $1', ['P1'])
  })
})
