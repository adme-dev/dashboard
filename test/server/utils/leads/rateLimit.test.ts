import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { allowRequest, _resetRateLimitForTests } from '../../../../server/utils/leads/rateLimit'

beforeEach(() => { _resetRateLimitForTests(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('allowRequest', () => {
  it('allows up to N requests per window then 429s', () => {
    for (let i = 0; i < 5; i++) {
      expect(allowRequest('k1', 5, 60_000).allowed).toBe(true)
    }
    const blocked = allowRequest('k1', 5, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retry_after_ms).toBeGreaterThan(0)
  })
  it('keys are independent', () => {
    for (let i = 0; i < 5; i++) allowRequest('k1', 5, 60_000)
    expect(allowRequest('k2', 5, 60_000).allowed).toBe(true)
  })
  it('window slides — old entries expire', () => {
    for (let i = 0; i < 5; i++) allowRequest('k1', 5, 60_000)
    vi.advanceTimersByTime(61_000)
    expect(allowRequest('k1', 5, 60_000).allowed).toBe(true)
  })
})
