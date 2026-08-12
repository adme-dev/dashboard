import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('client portal invitation issuer security', () => {
  it('stores only the invitation digest while emailing the raw one-time credential', () => {
    const source = readFileSync('server/api/agency/client-portal/invite.post.ts', 'utf8')

    expect(source).toContain('digestPortalSessionToken(token)')
    expect(source).toContain('tokenDigest')
    expect(source).toContain('token: token')
    expect(source).not.toContain('token: invitation.token')
    expect(source).not.toContain('inviteUrl: `/portal/accept-invite?token=')
  })

  it('removes the obsolete client credential-reset endpoint', () => {
    expect(existsSync('server/api/agency/client-portal/auth/reset-password.post.ts')).toBe(false)
  })

  it('removes the obsolete agency-namespaced client password login endpoint', () => {
    expect(existsSync('server/api/agency/client-portal/auth/login.post.ts')).toBe(false)
  })
})
