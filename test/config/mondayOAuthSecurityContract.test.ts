import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const start = readFileSync('server/api/agency/monday/oauth/start.get.ts', 'utf8')
const callback = readFileSync('server/api/agency/monday/oauth/callback.get.ts', 'utf8')
const config = readFileSync('server/utils/mondayOAuth.ts', 'utf8')

describe('Monday OAuth security contract', () => {
  it('starts only for HR administrators with a short-lived secure state cookie', () => {
    expect(start).toContain('requireHrAdmin(event)')
    expect(start).toContain('crypto.randomUUID()')
    expect(start).toContain('httpOnly: true')
    expect(start).toContain("sameSite: 'lax'")
    expect(start).toContain('maxAge: 10 * 60')
  })

  it('requires and consumes the one-time state before exchanging a code', () => {
    expect(callback).toContain('requireHrAdmin(event)')
    expect(callback).toContain('!code || !state || !expectedState || state !== expectedState')
    expect(callback).toContain('deleteCookie(event, MONDAY_OAUTH_STATE_COOKIE')
    expect(callback).toContain("https://auth.monday.com/oauth2/token")
    expect(callback).toContain('redirect_uri: `${getRequestURL(event).origin}${MONDAY_OAUTH_CALLBACK_PATH}`')
    expect(callback).not.toContain('process.env.MONDAY_OAUTH_STATE')
  })

  it('requests read, webhook, and explicit Campaign Exceptions write scopes', () => {
    expect(config).toContain("'boards:read'")
    expect(config).toContain("'updates:read'")
    expect(config).toContain("'assets:read'")
    expect(config).toContain("'webhooks:write'")
    expect(config).toContain("'boards:write'")
    expect(config).toContain("'updates:write'")
    expect(callback).toContain('scopes: [...MONDAY_OAUTH_SCOPES]')
  })
})
