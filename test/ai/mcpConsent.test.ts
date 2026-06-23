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
