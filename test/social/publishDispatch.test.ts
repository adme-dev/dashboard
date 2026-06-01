import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>; params?: Record<string, string>; headers?: Record<string, string> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireRole = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockPublishPost = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a) }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  execute: (...a: unknown[]) => mockExecute(...a),
}))
vi.mock('~~/server/utils/socialPublishing', () => ({ publishPost: (...a: unknown[]) => mockPublishPost(...a) }))
// the cron imports these from 'h3'
vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getHeader: (e: TestEvent, n: string) => e.headers?.[n],
  createError: (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i),
}))

const { default: publishH } = await import('../../server/api/agency/social/publishing/posts/[id]/publish.post')
const { default: cronH } = await import('../../server/api/cron/publish-social-posts.post')

describe('manual publish endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockExecute.mockResolvedValue(1)
    mockPublishPost.mockResolvedValue({ status: 'published', platformResults: { facebook: { status: 'success' } } })
  })

  it('publishes an approved post and persists results', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', status: 'approved', account_ids: ['a1'], platforms: ['facebook'] })
    const res = await publishH({ params: { id: 'P1' } } as any)
    expect(res.status).toBe('published')
    expect(mockPublishPost).toHaveBeenCalledOnce()
    // final UPDATE persists status + platform_results
    const finalUpdate = mockExecute.mock.calls.at(-1)!
    expect(finalUpdate[1][1]).toBe('published')
  })

  it('refuses to publish an unapproved draft', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', status: 'draft', approved_at: null, account_ids: [] })
    await expect(publishH({ params: { id: 'P1' } } as any)).rejects.toThrow('approved before publishing')
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('refuses to re-publish a published post', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', status: 'published', account_ids: [] })
    await expect(publishH({ params: { id: 'P1' } } as any)).rejects.toThrow('Cannot publish a published post')
  })
})

describe('dispatcher cron — idempotent claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockQueryRows.mockResolvedValue([{ id: 'P1' }]) // one due post
    mockQueryOne.mockResolvedValue({ id: 'P1', account_ids: ['a1'], platforms: ['facebook'] })
    mockPublishPost.mockResolvedValue({ status: 'published', platformResults: {} })
  })
  const evt = { headers: { 'x-cron-secret': 'test-secret' } } as any

  it('publishes a due post when the claim wins (execute→1)', async () => {
    mockExecute.mockResolvedValueOnce(1).mockResolvedValue(1) // claim wins, then final update
    const res = await cronH(evt)
    expect(res.processed).toBe(1)
    expect(mockPublishPost).toHaveBeenCalledOnce()
  })

  it('skips the post when the claim loses (execute→0): no double publish', async () => {
    mockExecute.mockResolvedValueOnce(0) // another tick already claimed it
    const res = await cronH(evt)
    expect(res.processed).toBe(0)
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated tick', async () => {
    await expect(cronH({ headers: { 'x-cron-secret': 'wrong' } } as any)).rejects.toThrow('Unauthorized')
  })
})
