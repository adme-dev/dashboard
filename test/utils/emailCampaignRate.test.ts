import { describe, it, expect } from 'vitest'
import { isRateLimitError, parseRetryAfter } from '~~/server/utils/email-marketing/campaignSend'

describe('isRateLimitError', () => {
  it('detects by statusCode, name, and message', () => {
    expect(isRateLimitError({ statusCode: 429 })).toBe(true)
    expect(isRateLimitError({ name: 'rate_limit_exceeded' })).toBe(true)
    expect(isRateLimitError({ message: 'Too many requests' })).toBe(true)
    expect(isRateLimitError({ message: 'rate limit hit' })).toBe(true)
  })

  it('is false for other errors / non-objects', () => {
    expect(isRateLimitError({ statusCode: 500, message: 'boom' })).toBe(false)
    expect(isRateLimitError(null)).toBe(false)
    expect(isRateLimitError('429')).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('parses integer seconds and clamps to [1, max]', () => {
    expect(parseRetryAfter('5')).toBe(5)
    expect(parseRetryAfter('0')).toBe(1)
    expect(parseRetryAfter('999', 2, 60)).toBe(60)
  })

  it('falls back when absent or non-numeric garbage', () => {
    expect(parseRetryAfter(undefined, 3)).toBe(3)
    expect(parseRetryAfter('', 3)).toBe(3)
    expect(parseRetryAfter('soon', 7)).toBe(7)
  })
})
