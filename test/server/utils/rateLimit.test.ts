import { describe, expect, it, vi } from 'vitest'

const { queryOneFresh } = vi.hoisted(() => ({ queryOneFresh: vi.fn() }))

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh,
  execute: vi.fn()
}))

const { checkAndConsume, enforceRateLimit } = await import('~~/server/utils/rateLimit')

const options = { key: 'test:user', limit: 2, windowSeconds: 60 }

describe('rateLimit failure mode', () => {
  it('keeps legacy callers fail-open when the rate-limit database is unavailable', async () => {
    queryOneFresh.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(checkAndConsume(options)).resolves.toMatchObject({ allowed: true, remaining: 2 })
  })

  it('fails closed with a 503 for billable endpoints when the database is unavailable', async () => {
    queryOneFresh.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(checkAndConsume({ ...options, failureMode: 'closed' })).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Rate limit service unavailable'
    })
  })

  it('continues to use 429 when a healthy limiter denies a request', async () => {
    queryOneFresh.mockResolvedValueOnce({ count: 3, window_started_at: new Date() })

    await expect(enforceRateLimit(undefined as never, { ...options, failureMode: 'closed' })).rejects.toMatchObject({
      statusCode: 429
    })
  })
})
