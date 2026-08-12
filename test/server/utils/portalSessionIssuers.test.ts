import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sessionRoutes = [
  'server/api/portal/auth/magic-link/verify.post.ts',
  'server/api/portal/auth/logout.post.ts',
  'server/api/agency/client-portal/access.post.ts',
  'server/api/agency/client-portal/auth/logout.post.ts',
  'server/api/agency/client-portal/auth/me.get.ts'
]

describe('portal session storage contract', () => {
  it.each(sessionRoutes)('%s never scans bcrypt session hashes', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')

    expect(source).not.toContain(`token_hash LIKE '$2%'`)
    expect(source).not.toMatch(/bcrypt\.compare\(sessionToken/)
    expect(source).not.toMatch(/bcrypt\.hash\(sessionToken/)
  })

  it.each([
    'server/api/portal/auth/magic-link/verify.post.ts',
    'server/utils/clientPortal/access.ts'
  ])('%s stores an indexed digest for issued sessions', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')

    expect(source).toContain('digestPortalSessionToken(sessionToken)')
  })
})

describe('portal invitation activation route', () => {
  it('uses the public, no-store portal auth namespace', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'app/pages/portal/accept-invite.vue'),
      'utf8'
    )

    expect(page).toContain(`'/api/portal/auth/accept-invite'`)
    expect(page).not.toContain('/api/agency/client-portal/accept-invite')
    expect(readFileSync(
      resolve(process.cwd(), 'server/api/portal/auth/accept-invite.post.ts'),
      'utf8'
    )).toContain('Accept a client portal invitation')

    const emailSource = readFileSync(resolve(process.cwd(), 'server/utils/email.ts'), 'utf8')
    const inviteSource = readFileSync(
      resolve(process.cwd(), 'server/api/agency/client-portal/invite.post.ts'),
      'utf8'
    )
    expect(emailSource).toContain('`${appUrl}/portal/accept-invite#token=${data.token}`')
    expect(inviteSource).toContain('token: token')
    expect(inviteSource).toContain('digestPortalSessionToken(token)')
    expect(emailSource).not.toContain('/client-portal/accept')
    expect(inviteSource).not.toContain('/client-portal/accept-invite')
  })
})
