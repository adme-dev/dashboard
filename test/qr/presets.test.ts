import { describe, it, expect } from 'vitest'
import { QrPageConfigSchema, defaultPageConfig, launchState } from '../../shared/qr/page'
import { renderQrLandingPage } from '../../server/utils/qr/landing/render'

const base = (t: 'interest' | 'subscribe') => ({ code: 'AbC1234', config: defaultPageConfig(t), assets: {}, submitPath: '/q/AbC1234/submit' })

describe('preset config blocks', () => {
  it('default launch and subscribe blocks on every template', () => {
    const c = defaultPageConfig('lead')
    expect(c.launch).toMatchObject({ launch_at: null, launched_headline: 'It\'s here', launched_redirect_url: null })
    expect(c.subscribe).toMatchObject({ list_id: null, offer_code: '' })
  })
  it('validates launch date, redirect and list id', () => {
    expect(QrPageConfigSchema.safeParse({ ...defaultPageConfig('interest'), launch: { launch_at: 'tomorrow' } }).success).toBe(false)
    expect(QrPageConfigSchema.safeParse({ ...defaultPageConfig('interest'), launch: { launched_redirect_url: 'ftp://x' } }).success).toBe(false)
    expect(QrPageConfigSchema.safeParse({ ...defaultPageConfig('subscribe'), subscribe: { list_id: 'nope' } }).success).toBe(false)
    expect(QrPageConfigSchema.safeParse({ ...defaultPageConfig('subscribe'), subscribe: { offer_code: ' welcome10 ' } }).data?.subscribe.offer_code).toBe('welcome10')
  })
})

describe('launchState', () => {
  it('is not launched without a date or before it, launched at/after it', () => {
    expect(launchState({ launch: { launch_at: null } } as any).launched).toBe(false)
    const at = '2026-09-01T00:00:00.000Z'
    expect(launchState({ launch: { launch_at: at } } as any, new Date('2026-08-31T23:59:59Z')).launched).toBe(false)
    expect(launchState({ launch: { launch_at: at } } as any, new Date('2026-09-01T00:00:00Z')).launched).toBe(true)
    expect(launchState({ launch: { launch_at: at } } as any, new Date('2026-09-02T00:00:00Z')).launchAt?.toISOString()).toBe(at)
  })
})

describe('renderQrLandingPage presets', () => {
  it('replaces the form with the launched copy and escapes it', () => {
    const html = renderQrLandingPage({ ...base('interest'), launched: { headline: 'It <b>launched</b>', body: 'Go see it', redirectUrl: 'https://example.com/launch' } })
    expect(html).not.toContain('id="qrf"')
    expect(html).toContain('It &lt;b&gt;launched&lt;/b&gt;')
    expect(html).toContain('href="https://example.com/launch"')
  })
  it('keeps the form when not launched', () => {
    expect(renderQrLandingPage({ ...base('interest'), launched: null })).toContain('id="qrf"')
  })
  it('renders the offer code inside the success state only', () => {
    const html = renderQrLandingPage({ ...base('subscribe'), offer: { code: 'WELCOME<10>', note: 'Show in store' } })
    const ok = html.slice(html.indexOf('id="ok"'))
    expect(ok).toContain('WELCOME&lt;10&gt;')
    expect(ok).toContain('Show in store')
    expect(html.slice(0, html.indexOf('id="ok"'))).not.toContain('WELCOME')
  })
})
