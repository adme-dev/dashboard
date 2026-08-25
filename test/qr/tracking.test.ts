import { describe, it, expect } from 'vitest'
import { buildTrackedUrl, slugifyCampaign } from '../../shared/qr/tracking'

describe('buildTrackedUrl', () => {
  it('appends utm + click id to a bare destination', () => {
    const u = new URL(buildTrackedUrl('https://client.com.au/landing', { code: 'AbC1234', enabled: true, medium: 'signage', campaign: 'Spring Sale' }))
    expect(u.searchParams.get('utm_source')).toBe('qr')
    expect(u.searchParams.get('utm_medium')).toBe('signage')
    expect(u.searchParams.get('utm_campaign')).toBe('spring-sale')
    expect(u.searchParams.get('utm_content')).toBe('AbC1234')
    expect(u.searchParams.get('xf_qr')).toBe('AbC1234')
    expect(u.pathname).toBe('/landing')
  })
  it('never overrides params the client already set', () => {
    const u = new URL(buildTrackedUrl('https://c.com/?utm_source=flyer&utm_campaign=x&keep=1', { code: 'Z', enabled: true }))
    expect(u.searchParams.get('utm_source')).toBe('flyer')
    expect(u.searchParams.get('utm_campaign')).toBe('x')
    expect(u.searchParams.get('keep')).toBe('1')
    expect(u.searchParams.get('utm_content')).toBe('Z')
    expect(u.searchParams.get('xf_qr')).toBe('Z')
  })
  it('falls back to the code as campaign and print as medium', () => {
    const u = new URL(buildTrackedUrl('https://c.com/p', { code: 'Q1', enabled: true, campaign: '   ' }))
    expect(u.searchParams.get('utm_campaign')).toBe('Q1')
    expect(u.searchParams.get('utm_medium')).toBe('print')
  })
  it('returns the destination untouched when disabled or unparseable', () => {
    expect(buildTrackedUrl('https://c.com/p?x=1', { code: 'Q', enabled: false })).toBe('https://c.com/p?x=1')
    expect(buildTrackedUrl('not a url', { code: 'Q', enabled: true })).toBe('not a url')
  })
  it('uses the per-code source override, normalised to a slug', () => {
    const u = new URL(buildTrackedUrl('https://c.com/p', { code: 'Q1', enabled: true, source: ' TV Spot ' }))
    expect(u.searchParams.get('utm_source')).toBe('tv-spot')
    expect(u.searchParams.get('xf_qr')).toBe('Q1')
    expect(new URL(buildTrackedUrl('https://c.com/p', { code: 'Q1', enabled: true, source: '' })).searchParams.get('utm_source')).toBe('qr')
  })
  it('preserves hash fragments', () => {
    expect(buildTrackedUrl('https://c.com/p#book', { code: 'Q', enabled: true })).toMatch(/\?utm_source=qr.*#book$/)
  })
})

describe('slugifyCampaign', () => {
  it('normalises accents, spaces and punctuation', () => {
    expect(slugifyCampaign('Café Menu — Winter \'26')).toBe('cafe-menu-winter-26')
  })
})
