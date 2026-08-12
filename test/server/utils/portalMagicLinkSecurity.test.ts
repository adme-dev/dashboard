import { describe, expect, it } from 'vitest'
import {
  digestPortalSessionToken,
  generatePortalMagicLinkToken,
  normalizePortalRedirect
} from '../../../server/utils/portalSession'

describe('portal magic-link security primitives', () => {
  it('generates independent 48-byte base64url credentials', () => {
    const first = generatePortalMagicLinkToken()
    const second = generatePortalMagicLinkToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(second).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(second).not.toBe(first)
  })

  it('produces a stable SHA-256 digest for database lookup', async () => {
    const token = 'A'.repeat(64)
    const digest = await digestPortalSessionToken(token)

    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(await digestPortalSessionToken(token)).toBe(digest)
    expect(digest).not.toContain(token)
  })

  it.each([
    undefined,
    null,
    '',
    'https://evil.example/portal',
    '//evil.example/portal',
    '/portal\\invoices',
    '/portalish',
    '/agency',
    '%E0%A4%A'
  ])('falls back to /portal for unsafe redirect %j', (redirect) => {
    expect(normalizePortalRedirect(redirect)).toBe('/portal')
  })

  it.each([
    '/portal',
    '/portal/invoices',
    '/portal/projects/123?tab=briefs',
    '%2Fportal%2Finvoices%3Fview%3Dcurrent'
  ])('preserves safe portal redirect %s', (redirect) => {
    const expected = redirect.startsWith('%') ? '/portal/invoices?view=current' : redirect
    expect(normalizePortalRedirect(redirect)).toBe(expected)
  })
})
