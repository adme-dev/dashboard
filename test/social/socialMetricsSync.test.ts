import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
}

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockFetchAccountMetrics = vi.fn()
const mockFetchPostMetrics = vi.fn()
const mockUpsertPostMetric = vi.fn()
const mockUpsertAccountMetric = vi.fn()
const mockResolveSocialAccountAccessToken = vi.fn()
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('h3', () => ({
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name],
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: vi.fn(async () => null),
  execute: (...args: unknown[]) => mockExecute(...args)
}))
vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProvider: () => ({
    fetchAccountMetrics: (...args: unknown[]) => mockFetchAccountMetrics(...args),
    fetchPostMetrics: (...args: unknown[]) => mockFetchPostMetrics(...args)
  })
}))
vi.mock('~~/server/utils/socialReporting/store', () => ({
  upsertPostMetric: (...args: unknown[]) => mockUpsertPostMetric(...args),
  upsertAccountMetric: (...args: unknown[]) => mockUpsertAccountMetric(...args)
}))

vi.mock('~~/server/utils/socialInbox/tokenRefresh', () => ({
  resolveSocialAccountAccessToken: (...args: unknown[]) => mockResolveSocialAccountAccessToken(...args)
}))

const { default: handler } = await import('../../server/api/cron/sync-social-metrics.post')

function event(input: TestEvent) {
  return input as Parameters<typeof handler>[0]
}

describe('social metrics sync target extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockFetchAccountMetrics.mockResolvedValue({ followers: 10, reach: 20 })
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'fb2',
          client_id: 'C1',
          platform: 'facebook',
          platform_account_id: 'PAGE2',
          access_token: 'token'
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'P1',
          platform_results: {
            'facebook:fb1': {
              platform: 'facebook',
              accountId: 'fb1',
              platformAccountId: 'PAGE1',
              platformPostId: 'post_page_1'
            },
            'facebook:fb2': {
              platform: 'facebook',
              accountId: 'fb2',
              platformAccountId: 'PAGE2',
              platformPostId: 'post_page_2'
            }
          }
        }
      ])
    mockFetchPostMetrics.mockResolvedValue([
      { postId: 'P1', platformPostId: 'post_page_2', impressions: 10 }
    ])
  })

  it('fetches post metrics only for the matching account result', async () => {
    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))
    expect(res.health).toEqual({
      status: 'healthy',
      accountsEligible: 1,
      accountsSynced: 1,
      unsupportedProviders: 0,
      accountFailures: 0,
      accountPartialFailures: 0,
      postTargetsDiscovered: 1,
      postsSynced: 1,
      postFailures: 0
    })
    expect(res.postsSynced).toBe(1)
    expect(mockFetchPostMetrics.mock.calls[0][0].posts).toEqual([
      { postId: 'P1', platformPostId: 'post_page_2' }
    ])
    expect(mockUpsertPostMetric).toHaveBeenCalledOnce()
    expect(mockConsoleWarn).not.toHaveBeenCalled()
  })

  it('returns critical health and warns when provider metric fetches fail', async () => {
    mockFetchAccountMetrics.mockRejectedValueOnce(new Error('quota exceeded'))
    mockFetchPostMetrics.mockRejectedValueOnce(new Error('timeout'))

    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))
    expect(res.health).toEqual({
      status: 'critical',
      accountsEligible: 1,
      accountsSynced: 0,
      unsupportedProviders: 0,
      accountFailures: 1,
      accountPartialFailures: 0,
      postTargetsDiscovered: 1,
      postsSynced: 0,
      postFailures: 1
    })
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-metrics.health', res.health)
    expect(mockConsoleError).toHaveBeenCalledTimes(2)
  })

  it('reports omitted post snapshots as failures instead of a healthy empty sync', async () => {
    mockFetchPostMetrics.mockResolvedValueOnce([])
    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))
    expect(res.health).toMatchObject({ status: 'critical', postsSynced: 0, postFailures: 1 })
    expect(mockUpsertPostMetric).not.toHaveBeenCalled()
  })

  it('ignores returned snapshots for another account target', async () => {
    mockFetchPostMetrics.mockResolvedValueOnce([{ postId: 'P1', platformPostId: 'post_page_1', impressions: 10 }])
    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))
    expect(res.health).toMatchObject({ status: 'critical', postsSynced: 0, postFailures: 1 })
    expect(mockUpsertPostMetric).not.toHaveBeenCalled()
  })
})

describe('social metrics sync LinkedIn token refresh', () => {
  const linkedinAccount = {
    id: 'li1',
    client_id: 'C1',
    platform: 'linkedin',
    platform_account_id: '79988552',
    access_token: 'stale',
    refresh_token: 'RT',
    token_expires_at: '2020-01-01T00:00:00.000Z'
  }
  const linkedinPosts = [{
    id: 'P1',
    platform_results: { linkedin: { platform: 'linkedin', accountId: 'li1', platformPostId: 'urn:li:share:1' } }
  }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRows.mockReset()
    mockFetchAccountMetrics.mockResolvedValue({ followers: 3 })
    mockFetchPostMetrics.mockResolvedValue([{ postId: 'P1', platformPostId: 'urn:li:share:1', impressions: 1 }])
  })

  it('refreshes the LinkedIn token before account and post metric calls', async () => {
    mockQueryRows.mockResolvedValueOnce([linkedinAccount]).mockResolvedValueOnce(linkedinPosts)
    mockResolveSocialAccountAccessToken.mockResolvedValueOnce('fresh')

    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))

    expect(mockQueryRows.mock.calls[0]![0]).toContain('refresh_token, token_expires_at')
    expect(mockResolveSocialAccountAccessToken).toHaveBeenCalledWith(expect.objectContaining({
      account: { id: 'li1', platform: 'linkedin', access_token: 'stale', refresh_token: 'RT', token_expires_at: '2020-01-01T00:00:00.000Z' }
    }))
    expect(mockFetchAccountMetrics).toHaveBeenCalledWith({ accountId: '79988552', accessToken: 'fresh' })
    expect(mockFetchPostMetrics).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'fresh' }))
    expect(res.health).toMatchObject({ status: 'healthy', accountsSynced: 1, postsSynced: 1 })
  })

  it('reports partially unavailable account metrics as a warning, not healthy', async () => {
    mockQueryRows.mockResolvedValueOnce([linkedinAccount]).mockResolvedValueOnce(linkedinPosts)
    mockResolveSocialAccountAccessToken.mockResolvedValueOnce('fresh')
    mockFetchAccountMetrics.mockResolvedValueOnce({ followers: 3, partialFailures: ['share statistics unavailable: 503'] })

    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))

    expect(mockUpsertAccountMetric).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metric: { followers: 3, partialFailures: ['share statistics unavailable: 503'] }
    }))
    expect(res.health).toMatchObject({ status: 'warning', accountsSynced: 1, accountPartialFailures: 1 })
  })

  it('counts a failed refresh as an account failure and skips provider calls', async () => {
    mockQueryRows.mockResolvedValueOnce([linkedinAccount]).mockResolvedValueOnce(linkedinPosts)
    mockResolveSocialAccountAccessToken.mockRejectedValueOnce(new Error('LinkedIn token refresh failed'))

    const res = await handler(event({ headers: { 'x-cron-secret': 'test-secret' } }))

    expect(mockFetchAccountMetrics).not.toHaveBeenCalled()
    expect(mockFetchPostMetrics).not.toHaveBeenCalled()
    expect(res.health).toMatchObject({ status: 'critical', accountFailures: 1, postFailures: 1 })
  })
})
