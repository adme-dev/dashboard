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
const mockStartSocialPublishingWorkflow = vi.fn()
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
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  startSocialPublishingWorkflow: (...a: unknown[]) => mockStartSocialPublishingWorkflow(...a)
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
    expect(mockQueryOne.mock.calls[1][0]).toContain('status = ANY($3::text[])')
    expect(mockQueryOne.mock.calls[1][1]).toEqual(['P1', 'C1', ['approved'], null])
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
    delete process.env.AGENCY_WORKFLOWS_ENABLED
    delete process.env.AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY
    mockQueryRows
      .mockResolvedValueOnce([{ id: 'P1', client_id: 'C1', scheduled_at: '2026-07-02T00:00:00.000Z' }]) // one due post
      .mockResolvedValue([{ id: 'a1', platform: 'facebook', platform_account_id: 'fb-1', access_token: 'token', account_name: 'Facebook' }])
    mockQueryOne.mockResolvedValue({ id: 'P1', client_id: 'C1', status: 'publishing', account_ids: ['a1'], platforms: ['facebook'] })
    mockPublishPost.mockResolvedValue({ status: 'published', platformResults: {} })
    mockStartSocialPublishingWorkflow.mockResolvedValue({
      ok: true,
      enabled: true,
      workflow: 'social.post.publish',
      instanceId: 'social-publish-C1-P1',
      transport: 'service-binding'
    })
  })
  const evt: TestEvent = { headers: { 'x-cron-secret': 'test-secret' } }

  it('publishes a due post when the atomic claim wins', async () => {
    mockExecute.mockResolvedValue(1)
    const res = await cronH(evt)
    expect(res.processed).toBe(1)
    expect(mockPublishPost).toHaveBeenCalledOnce()
    expect(mockQueryRows.mock.calls[0][0]).toContain('status = \'scheduled\'')
    expect(mockQueryOne.mock.calls[0][0]).toContain('UPDATE social_posts')
    expect(mockQueryOne.mock.calls[0][0]).toContain('status = ANY($3::text[])')
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['P1', null, ['scheduled'], 3])
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('last_error'), [['a1'], 'C1'])
  })

  it('starts publishing workflows for due posts when workflow-primary cutover is enabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'true'
    process.env.AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY = 'true'

    const res = await cronH(evt)

    expect(res.processed).toBe(1)
    expect(res.results).toEqual([{
      id: 'P1',
      status: 'workflow_started',
      workflowInstanceId: 'social-publish-C1-P1'
    }])
    expect(mockStartSocialPublishingWorkflow).toHaveBeenCalledWith(evt, {
      postId: 'P1',
      clientId: 'C1',
      scheduledAt: '2026-07-02T00:00:00.000Z',
      trigger: 'cron',
      requestedBy: 'social-dispatch-cron'
    })
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('falls back to direct cron publish when workflow-primary kickoff fails', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'true'
    process.env.AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY = 'true'
    mockStartSocialPublishingWorkflow.mockResolvedValueOnce({
      ok: false,
      enabled: true,
      reason: 'not_configured'
    })

    const res = await cronH(evt)

    expect(res.processed).toBe(1)
    expect(res.results).toEqual([{ id: 'P1', status: 'published' }])
    expect(mockPublishPost).toHaveBeenCalledOnce()
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-dispatch.workflow-start.failed', {
      postId: 'P1',
      clientId: 'C1',
      reason: 'not_configured'
    })
  })

  it('skips the post when the claim loses: no double publish', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'publishing' })
      .mockResolvedValueOnce({ due_backlog: 0, exhausted_failures: 0, oldest_due_at: null })
    const res = await cronH(evt)
    expect(res.processed).toBe(0)
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated tick', async () => {
    await expect(cronH({ headers: { 'x-cron-secret': 'wrong' } })).rejects.toThrow('Unauthorized')
  })

  it('returns dispatcher health and warns when due backlog is saturated', async () => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({ id: `P${index}` })))
      .mockResolvedValue([])
    for (let index = 0; index < 10; index++) {
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: `P${index}`, client_id: 'C1', status: 'publishing' })
    }
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
