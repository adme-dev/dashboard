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
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('h3', () => ({
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name],
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
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
      postTargetsDiscovered: 1,
      postsSynced: 0,
      postFailures: 1
    })
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-metrics.health', res.health)
    expect(mockConsoleError).toHaveBeenCalledTimes(2)
  })
})
