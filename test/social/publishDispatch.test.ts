import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>, params?: Record<string, string>, headers?: Record<string, string> }
interface TestGlobal {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
interface ManualPublishResult { status: string, platformResults?: Record<string, unknown> }
interface CronResult {
  processed: number
  results?: Array<{ id: string, status: string }>
  health: {
    status: 'healthy' | 'warning' | 'critical'
    dueBacklog: number
    exhaustedFailures: number
    oldestDueAt: string | null
  }
}
type TestHandler<T> = (event: TestEvent) => Promise<T>

const g = globalThis as typeof globalThis & TestGlobal
g.defineEventHandler = <T>(fn: T) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireRole = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockPublishPost = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a) }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  execute: (...a: unknown[]) => mockExecute(...a)
}))
vi.mock('~~/server/utils/socialPublishing', () => ({ publishPost: (...a: unknown[]) => mockPublishPost(...a) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))
// the cron imports these from 'h3'
vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (e: TestEvent, n: string) => e.headers?.[n],
  createError: (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)
}))

const { default: publishHandler } = await import('../../server/api/agency/social/publishing/posts/[id]/publish.post')
const { default: cronHandler } = await import('../../server/api/cron/publish-social-posts.post')
const publishH = publishHandler as TestHandler<ManualPublishResult>
const cronH = cronHandler as TestHandler<CronResult>

describe('manual publish endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsoleWarn.mockClear()
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockExecute.mockResolvedValue(1)
    mockPublishPost.mockResolvedValue({ status: 'published', platformResults: { facebook: { status: 'success' } } })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('publishes an approved post and persists results', async () => {
    const post = { id: 'P1', client_id: 'C1', status: 'approved', approved_at: '2026-07-01T00:00:00.000Z', account_ids: ['a1'], platforms: ['facebook'] }
    mockQueryOne
      .mockResolvedValueOnce(post)
      .mockResolvedValueOnce({ ...post, status: 'publishing' })
    const event: TestEvent = { params: { id: 'P1' } }
    const res = await publishH(event)
    expect(res.status).toBe('published')
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockPublishPost).toHaveBeenCalledOnce()
    expect(mockQueryOne.mock.calls[1][0]).toContain('UPDATE social_posts')
    expect(mockQueryOne.mock.calls[1][0]).toContain('status = \'approved\'')
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('last_error'), [['a1'], 'C1'])
    // final UPDATE persists status + platform_results
    const finalUpdate = mockExecute.mock.calls.find(call => String(call[0]).includes('published_at=CASE'))!
    expect(finalUpdate[0]).toContain('published_at=CASE')
    expect(finalUpdate[1][1]).toBe('published')
  })

  it('refuses to publish an unapproved draft', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'draft', approved_at: null, account_ids: [] })
    await expect(publishH({ params: { id: 'P1' } })).rejects.toThrow('approved before publishing')
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('refuses to re-publish a published post', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'published', account_ids: [] })
    await expect(publishH({ params: { id: 'P1' } })).rejects.toThrow('Cannot publish a published post')
  })

  it('does not publish when the atomic manual claim loses', async () => {
    const post = { id: 'P1', client_id: 'C1', status: 'approved', approved_at: '2026-07-01T00:00:00.000Z', account_ids: ['a1'], platforms: ['facebook'] }
    mockQueryOne
      .mockResolvedValueOnce(post)
      .mockResolvedValueOnce(null)

    await expect(publishH({ params: { id: 'P1' } })).rejects.toThrow('already being published')
    expect(mockPublishPost).not.toHaveBeenCalled()
  })
})

describe('dispatcher cron — idempotent claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockQueryRows.mockResolvedValue([{ id: 'P1' }]) // one due post
    mockQueryOne.mockResolvedValue({ id: 'P1', client_id: 'C1', status: 'scheduled', account_ids: ['a1'], platforms: ['facebook'] })
    mockPublishPost.mockResolvedValue({ status: 'published', platformResults: {} })
  })
  const evt: TestEvent = { headers: { 'x-cron-secret': 'test-secret' } }

  it('publishes a due post when the claim wins (execute→1)', async () => {
    mockExecute.mockResolvedValueOnce(1).mockResolvedValue(1) // claim wins, then final update
    const res = await cronH(evt)
    expect(res.processed).toBe(1)
    expect(mockPublishPost).toHaveBeenCalledOnce()
    expect(mockQueryRows.mock.calls[0][0]).toContain('status = \'scheduled\'')
    expect(mockExecute.mock.calls[0][0]).toContain('status = \'scheduled\'')
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('last_error'), [['a1'], 'C1'])
  })

  it('skips the post when the claim loses (execute→0): no double publish', async () => {
    mockExecute.mockResolvedValueOnce(0) // another tick already claimed it
    const res = await cronH(evt)
    expect(res.processed).toBe(0)
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated tick', async () => {
    await expect(cronH({ headers: { 'x-cron-secret': 'wrong' } })).rejects.toThrow('Unauthorized')
  })

  it('returns dispatcher health and warns when due backlog is saturated', async () => {
    mockQueryRows
      .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({ id: `P${index}` })))
      .mockResolvedValue([])
    mockExecute.mockResolvedValue(0)
    mockQueryOne.mockResolvedValueOnce({
      due_backlog: 23,
      exhausted_failures: 4,
      oldest_due_at: '2026-07-01T00:00:00.000Z'
    })

    const res = await cronH(evt)
    expect(res.processed).toBe(0)
    expect(res.health).toEqual({
      status: 'critical',
      dueBacklog: 23,
      exhaustedFailures: 4,
      oldestDueAt: '2026-07-01T00:00:00.000Z'
    })
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-dispatch.health', res.health)
  })
})
