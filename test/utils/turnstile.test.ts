import { describe, it, expect } from 'vitest'
import { turnstileVerdict } from '~~/server/utils/turnstile'

describe('turnstileVerdict', () => {
  it('passes only when success is exactly true', () => {
    expect(turnstileVerdict({ success: true })).toBe(true)
  })

  it('fails on success:false (with error codes)', () => {
    expect(turnstileVerdict({ success: false, 'error-codes': ['invalid-input-response'] })).toBe(false)
  })

  it('fails on missing / malformed / non-object payloads', () => {
    expect(turnstileVerdict({})).toBe(false)
    expect(turnstileVerdict(null)).toBe(false)
    expect(turnstileVerdict(undefined)).toBe(false)
    expect(turnstileVerdict('success')).toBe(false)
    expect(turnstileVerdict({ success: 'true' })).toBe(false) // string, not boolean
  })
})
