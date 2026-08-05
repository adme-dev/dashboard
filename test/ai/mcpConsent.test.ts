import { describe, it, expect } from 'vitest'
import { buildConsentHtml } from '~~/server/utils/ai/mcp/consent'

describe('buildConsentHtml', () => {
  it('includes the user name, read-only + read+write + cancel URLs, and both framings', () => {
    const html = buildConsentHtml({
      userName: 'Jane Doe',
      allowUrl: '/api/mcp/authorize?consent=granted',
      allowWriteUrl: '/api/mcp/authorize?consent=granted&write=granted',
      cancelUrl: 'https://w/callback?error=access_denied',
    })
    expect(html).toContain('Jane Doe')
    expect(html).toContain('href="/api/mcp/authorize?consent=granted"')
    expect(html).toContain('href="/api/mcp/authorize?consent=granted&amp;write=granted"')
    expect(html).toContain('href="https://w/callback?error=access_denied"')
    expect(html.toLowerCase()).toContain('read-only')
    expect(html.toLowerCase()).toContain('read + write')
  })

  it('discloses ordinary-user governance separately from active Owner God Mode', () => {
    const html = buildConsentHtml({ userName: 'Owner', allowUrl: '/a', allowWriteUrl: '/aw', cancelUrl: '/c' })

    expect(html).toContain('For ordinary users, confirmation and money-mover acknowledgement controls remain in force.')
    expect(html).toContain('Freshly revalidated active owners using Owner God Mode may execute registered capabilities directly')
    expect(html).not.toContain('Every change still needs an explicit confirmation')
  })

  it('states every non-bypassable Owner God Mode boundary', () => {
    const html = buildConsentHtml({ userName: 'Owner', allowUrl: '/a', allowWriteUrl: '/aw', cancelUrl: '/c' })

    for (const boundary of [
      'authentication and session validity',
      'exact active-owner status',
      'tenant, client and entity isolation',
      'immutable audit',
      'emergency disable',
      'provider, binding and secret availability',
      'SSRF protections'
    ]) {
      expect(html).toContain(boundary)
    }
  })

  it('escapes HTML in the user name (XSS in markup)', () => {
    const html = buildConsentHtml({ userName: '<script>alert(1)</script>', allowUrl: '/a', allowWriteUrl: '/aw', cancelUrl: '/c' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes in URLs so they cannot break out of the href attribute', () => {
    const html = buildConsentHtml({ userName: 'x', allowUrl: '/a"><img src=x onerror=alert(1)>', allowWriteUrl: '/aw"><img src=y>', cancelUrl: '/c' })
    expect(html).not.toContain('"><img src=x')
    expect(html).not.toContain('"><img src=y')
    expect(html).toContain('&quot;')
  })
})
