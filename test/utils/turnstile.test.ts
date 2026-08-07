import { describe, it, expect } from 'vitest'
import { turnstileVerdict } from '~~/server/utils/turnstile'

describe('turnstileVerdict', () => {
  it('passes only when success is exactly true', () => {
    expect(turnstileVerdict({ success: true })).toBe(true)
  })

  it('fails on success:false (with error codes)', () => {
    expect(turnstileVerdict({ 'success': false, 'error-codes': ['invalid-input-response'] })).toBe(false)
  })

  it('fails on missing / malformed / non-object payloads', () => {
    expect(turnstileVerdict({})).toBe(false)
    expect(turnstileVerdict(null)).toBe(false)
    expect(turnstileVerdict(undefined)).toBe(false)
    expect(turnstileVerdict('success')).toBe(false)
    expect(turnstileVerdict({ success: 'true' })).toBe(false) // string, not boolean
  })

  it('validates configured action and hostname without accepting partial matches', () => {
    const response = { success: true, action: 'send-create', hostname: 'app.xeroflow.io' }
    expect(turnstileVerdict(response, {
      expectedAction: 'send-create',
      expectedHostname: 'app.xeroflow.io'
    })).toBe(true)
    expect(turnstileVerdict(response, { expectedAction: 'send-verify' })).toBe(false)
    expect(turnstileVerdict(response, { expectedHostname: 'evil.example' })).toBe(false)
  })
})
