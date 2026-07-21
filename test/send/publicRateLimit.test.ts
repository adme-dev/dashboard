import { describe, expect, it, vi } from 'vitest'
import type { PublicSendRateLimitError } from '../../server/utils/send/publicRateLimit'
import { createPublicSendRateLimiter } from '../../server/utils/send/publicRateLimit'

describe('public Send layered rate limits', () => {
  it('checks global/IP and email layers without sending raw identity to the limiter', async () => {
    const rateCheck = vi.fn().mockResolvedValue({ allowed: true })
    const limiter = {} as never
    const service = createPublicSendRateLimiter({ rateCheck })

    await expect(service.checkCreate({
      limiter,
      salt: 's'.repeat(32),
      ip: '203.0.113.10',
      email: 'Sender@Example.com'
    })).resolves.toEqual({ allowed: true })

    expect(rateCheck).toHaveBeenCalledTimes(2)
    const serialized = JSON.stringify(rateCheck.mock.calls)
    expect(serialized).not.toContain('203.0.113.10')
    expect(serialized).not.toContain('sender@example.com')
    expect(rateCheck.mock.calls[0]?.[1]).toMatchObject({
      writeKey: 'send-public-create',
      keyLimit: 300,
      ipLimit: 5,
      windowMs: 900_000
    })
    expect(rateCheck.mock.calls[1]?.[1]).toMatchObject({
      keyLimit: 3,
      ipLimit: 3,
      windowMs: 900_000,
      ipHash: null
    })
  })

  it.each([
    ['missing limiter', { limiter: undefined, salt: 's'.repeat(32), ip: '203.0.113.10' }],
    ['missing salt', { limiter: {} as never, salt: '', ip: '203.0.113.10' }],
    ['missing canonical IP', { limiter: {} as never, salt: 's'.repeat(32), ip: null }]
  ])('fails closed for %s', async (_label, overrides) => {
    const service = createPublicSendRateLimiter({ rateCheck: vi.fn() })
    await expect(service.checkCreate({
      limiter: {} as never,
      salt: 's'.repeat(32),
      ip: '203.0.113.10',
      email: 'sender@example.com',
      ...overrides
    })).rejects.toEqual(expect.objectContaining<Partial<PublicSendRateLimitError>>({
      code: 'RATE_LIMIT_UNAVAILABLE'
    }))
  })

  it('returns bounded retry guidance when either layer denies', async () => {
    const rateCheck = vi.fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSec: 991_000 })
    const service = createPublicSendRateLimiter({ rateCheck })

    await expect(service.checkCreate({
      limiter: {} as never,
      salt: 's'.repeat(32),
      ip: '203.0.113.10',
      email: 'sender@example.com'
    })).rejects.toEqual(expect.objectContaining<Partial<PublicSendRateLimitError>>({
      code: 'RATE_LIMITED',
      retryAfterSec: 900
    }))
  })

  it('applies a separate IP-only verification budget', async () => {
    const rateCheck = vi.fn().mockResolvedValue({ allowed: true })
    const service = createPublicSendRateLimiter({ rateCheck })

    await expect(service.checkVerify({
      limiter: {} as never,
      salt: 's'.repeat(32),
      ip: '203.0.113.10'
    })).resolves.toEqual({ allowed: true })
    expect(rateCheck).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      writeKey: 'send-public-verify',
      keyLimit: 300,
      ipLimit: 10,
      windowMs: 900_000
    }))
  })
})
