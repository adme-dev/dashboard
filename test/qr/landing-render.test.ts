import { describe, it, expect } from 'vitest'
import { renderQrLandingPage } from '../../server/utils/qr/landing/render'
import { renderMarkdownLite } from '../../server/utils/qr/landing/markdown'
import { defaultPageConfig, QrPageConfigSchema, normalisePostcode } from '../../shared/qr/page'

const base = () => ({ code: 'AbC1234', config: defaultPageConfig('competition', { clientName: 'Frankston Motor Group' }), assets: {}, submitPath: '/q/AbC1234/submit' })

describe('renderQrLandingPage', () => {
  it('escapes every config string', () => {
    const cfg = QrPageConfigSchema.parse({ ...base().config, headline: '<img src=x onerror=alert(1)>', subheadline: 'a"b', footer: { promoter_name: '<b>x</b>' } })
    const html = renderQrLandingPage({ ...base(), config: cfg })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
  it('renders fields with types, required flags and the honeypot', () => {
    const html = renderQrLandingPage(base())
    expect(html).toContain('name="full_name"')
    expect(html).toContain('type="tel"')
    expect(html).toContain('inputmode="numeric" pattern="[0-9]{4}"')
    expect(html).toContain('name="website"') // honeypot
    expect(html).toContain('name="marketing_consent"')
  })
  it('omits pixels unless allowed, and never in preview', () => {
    const cfg = QrPageConfigSchema.parse({ ...base().config, pixels: { ga4_measurement_id: 'G-ABC1234', meta_pixel_id: '123456789' } })
    expect(renderQrLandingPage({ ...base(), config: cfg })).not.toContain('gtag')
    expect(renderQrLandingPage({ ...base(), config: cfg, allowPixels: true })).toContain('G-ABC1234')
    expect(renderQrLandingPage({ ...base(), config: cfg, allowPixels: true })).toContain('fbq(')
    expect(renderQrLandingPage({ ...base(), config: cfg, allowPixels: false, preview: true })).not.toContain('fbq(')
  })
  it('preview disables the submit button and shows a banner', () => {
    const html = renderQrLandingPage({ ...base(), preview: true })
    expect(html).toContain('Preview — submissions are disabled')
    expect(html).toMatch(/<button type="submit" id="btn" disabled>/)
  })
  it('renders the server-side success state', () => {
    const html = renderQrLandingPage({ ...base(), submitted: true })
    expect(html).toMatch(/<div id="formwrap" hidden>/)
    expect(html).toMatch(/<div id="ok" class="ok">/)
  })
  it('includes turnstile only when a site key is given', () => {
    expect(renderQrLandingPage(base())).not.toContain('cf-turnstile')
    expect(renderQrLandingPage({ ...base(), turnstileSiteKey: '0x4AAA' })).toContain('data-sitekey="0x4AAA"')
  })
})

describe('markdown-lite', () => {
  it('supports bold, links, lists and blocks javascript: urls', () => {
    const html = renderMarkdownLite('Hello **world**\n\n- one\n- [two](https://x.com)\n\n[bad](javascript:alert(1)) <script>x</script>')
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('<ul><li>one</li><li><a href="https://x.com" rel="noopener">two</a></li></ul>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('page config', () => {
  it('defaults per template and caps fields at 6', () => {
    expect(defaultPageConfig('subscribe').fields.map(f => f.key)).toEqual(['email'])
    expect(() => QrPageConfigSchema.parse({ ...defaultPageConfig('lead'), fields: Array.from({ length: 7 }, (_, i) => ({ key: `f${i}`, label: 'x' })) })).toThrow()
  })
  it('rejects non-http redirect urls and bad pixel ids', () => {
    expect(() => QrPageConfigSchema.parse({ ...defaultPageConfig('lead'), success_redirect_url: 'javascript:alert(1)' })).toThrow()
    expect(() => QrPageConfigSchema.parse({ ...defaultPageConfig('lead'), pixels: { ga4_measurement_id: 'UA-1' } })).toThrow()
  })
  it('normalises postcodes', () => {
    expect(normalisePostcode(' 3199 ')).toBe('3199')
    expect(normalisePostcode('VIC 3199')).toBe('3199')
    expect(normalisePostcode('31')).toBeNull()
  })
})
