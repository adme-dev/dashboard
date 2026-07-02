import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

interface WorkflowCallbackResult {
  ok: boolean
  workflow: string
  postId: string
  clientId: string
  result: {
    ok: boolean
    skipped?: boolean
    reason?: string
    status?: string
    platformResults?: Record<string, unknown>
  }
}

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockPublishPost = vi.fn()
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/socialPublishing', () => ({
  publishPost: (...args: unknown[]) => mockPublishPost(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/internal/workflows/social-publishing/publish.post')
const workflowCallback = handler as (event: TestEvent) => Promise<WorkflowCallbackResult>

describe('social publishing workflow callback', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockQueryRows.mockResolvedValue([{
      id: 'acct-1',
      platform: 'facebook',
      platform_account_id: 'fb-1',
      access_token: 'token',
      refresh_token: null,
      token_expires_at: null,
      account_name: 'Dealer Facebook',
      last_error: null,
      metadata: {}
    }])
    mockExecute.mockResolvedValue(1)
    mockPublishPost.mockResolvedValue({
      status: 'published',
      platformResults: {
        facebook: { status: 'success', platformPostId: 'fb-post-1' }
      }
    })
  })

  it('requires the workflow callback secret before touching publishing state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockPublishPost).not.toHaveBeenCalled()
  })

  it('accepts WORKFLOW_SERVICE_SECRET as the callback secret fallback', async () => {
    delete process.env.WORKFLOW_CALLBACK_SECRET
    process.env.WORKFLOW_SERVICE_SECRET = 'service-secret'
    mockQueryOne.mockResolvedValueOnce({
      id: 'post-1',
      client_id: 'client-1',
      status: 'publishing',
      content: 'Scheduled post',
      media_urls: [],
      link_url: null,
      platforms: ['facebook'],
      platform_overrides: {},
      account_ids: ['acct-1']
    })

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'service-secret' },
      body: validPayload()
    })

    expect(result.result).toMatchObject({ ok: true, status: 'published' })
    expect(mockPublishPost).toHaveBeenCalledOnce()
  })

  it('claims a scheduled post idempotently and publishes through the shared dispatcher', async () => {
    const claimedPost = {
      id: 'post-1',
      client_id: 'client-1',
      status: 'publishing',
      content: 'Scheduled post',
      media_urls: [],
      link_url: null,
      platforms: ['facebook'],
      platform_overrides: {},
      account_ids: ['acct-1']
    }
    mockQueryOne.mockResolvedValueOnce(claimedPost)

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toMatchObject({
      ok: true,
      workflow: 'social.post.publish',
      postId: 'post-1',
      clientId: 'client-1',
      result: {
        ok: true,
        status: 'published'
      }
    })
    expect(mockQueryOne.mock.calls[0][0]).toContain('UPDATE social_posts')
    expect(mockQueryOne.mock.calls[0][0]).toContain('status = ANY($3::text[])')
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['post-1', 'client-1', ['scheduled'], 3])
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('last_error'), [['acct-1'], 'client-1'])
    expect(mockPublishPost).toHaveBeenCalledWith(expect.objectContaining({
      id: 'post-1',
      accounts: [expect.objectContaining({ id: 'acct-1', platform: 'facebook' })]
    }))
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('published_at=CASE'), [
      'post-1',
      'published',
      JSON.stringify({ facebook: { status: 'success', platformPostId: 'fb-post-1' } }),
      'client-1'
    ])
  })

  it('acknowledges already-claimed posts without double-publishing', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'post-1', client_id: 'client-1', status: 'published' })

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result.result).toMatchObject({
      ok: true,
      skipped: true,
      reason: 'not_claimed'
    })
    expect(mockPublishPost).not.toHaveBeenCalled()
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publishing.dispatch.skipped', expect.objectContaining({
      source: 'workflow',
      postId: 'post-1',
      currentStatus: 'published'
    }))
  })

  it('persists a failed attempt when dispatch throws after the claim', async () => {
    const claimedPost = {
      id: 'post-1',
      client_id: 'client-1',
      status: 'publishing',
      content: 'Scheduled post',
      media_urls: [],
      link_url: null,
      platforms: ['facebook'],
      platform_overrides: {},
      account_ids: ['acct-1']
    }
    mockQueryOne.mockResolvedValueOnce(claimedPost)
    mockPublishPost.mockRejectedValueOnce(new Error('provider unavailable'))

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result.result).toMatchObject({
      ok: true,
      status: 'failed',
      platformResults: {
        dispatch: {
          status: 'failed',
          error: 'provider unavailable'
        }
      }
    })
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('published_at=CASE'), [
      'post-1',
      'failed',
      JSON.stringify({ dispatch: { status: 'failed', error: 'provider unavailable' } }),
      'client-1'
    ])
    expect(mockConsoleError).toHaveBeenCalledWith('social-publishing.dispatch.failed', expect.objectContaining({
      source: 'workflow',
      postId: 'post-1',
      clientId: 'client-1',
      error: 'provider unavailable'
    }))
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'wrong', postId: 'post-1', clientId: 'client-1', trigger: 'schedule' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockPublishPost).not.toHaveBeenCalled()
    expect(mockConsoleError).not.toHaveBeenCalled()
  })
})

function validPayload() {
  return {
    kind: 'social.post.publish',
    postId: 'post-1',
    clientId: 'client-1',
    trigger: 'schedule',
    scheduledAt: '2026-07-02T00:00:00.000Z'
  }
}
