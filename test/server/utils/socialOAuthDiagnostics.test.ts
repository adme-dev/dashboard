import { afterEach, describe, expect, it, vi } from 'vitest'

import { logOAuthFailure } from '~~/server/utils/socialOAuth/diagnostics'

function captureWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

afterEach(() => vi.restoreAllMocks())

describe('logOAuthFailure', () => {
  it('surfaces the provider, reason and client', () => {
    const warn = captureWarn()
    logOAuthFailure('meta', 'token_exchange_failed', new Error('boom'), 'client-7')
    expect(warn.mock.calls[0]?.[0]).toContain('[socialOAuth:meta]')
    expect(warn.mock.calls[0]?.[0]).toContain('token_exchange_failed')
    expect(warn.mock.calls[0]?.[0]).toContain('client=client-7')
    expect(warn.mock.calls[0]?.[0]).toContain('boom')
  })

  it('digs the message out of the shapes providers actually use', () => {
    const warn = captureWarn()
    // Graph nests it under data.error.message
    logOAuthFailure('meta', 'r', { response: { status: 400 }, data: { error: { message: 'Invalid OAuth redirect URI' } } })
    // OAuth2 spec style
    logOAuthFailure('linkedin', 'r', { statusCode: 401, data: { error_description: 'expired authorization code' } })
    // h3 error
    logOAuthFailure('tiktok', 'r', { statusCode: 403, statusMessage: 'Forbidden' })

    const lines = warn.mock.calls.map(c => String(c[0]))
    expect(lines[0]).toContain('status=400')
    expect(lines[0]).toContain('Invalid OAuth redirect URI')
    expect(lines[1]).toContain('status=401')
    expect(lines[1]).toContain('expired authorization code')
    expect(lines[2]).toContain('Forbidden')
  })

  it('never throws on odd input, and omits absent fields', () => {
    const warn = captureWarn()
    for (const bad of [null, undefined, 'plain string', {}, 42]) {
      expect(() => logOAuthFailure('youtube', 'reason', bad)).not.toThrow()
    }
    const first = String(warn.mock.calls[0]?.[0])
    expect(first).not.toContain('client=')
    expect(first).not.toContain('status=')
    expect(first).toContain('unknown error')
  })
})
