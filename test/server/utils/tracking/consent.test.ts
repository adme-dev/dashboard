import { describe, it, expect } from 'vitest'
import { snapshotConsent } from '../../../../server/utils/tracking/consent'

describe('snapshotConsent', () => {
  it('AU visitor with no cookie → tracking granted, analytics/marketing denied', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: 'AU' })
    expect(s.source).toBe('au_implicit_essential')
    expect(s.tracking).toBe('granted')
    expect(s.analytics).toBe('denied')
    expect(s.marketing).toBe('denied')
  })

  it('EU visitor with no cookie → all denied', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: 'DE' })
    expect(s.source).toBe('eu_implicit_deny')
    expect(s.marketing).toBe('denied')
  })

  it('explicit cookie wins regardless of region', () => {
    const cookie = JSON.stringify({
      tracking: true,
      analytics: true,
      marketing: true,
      updatedAt: '2026-05-31T00:00:00Z',
      policyVersion: 'privacy-2026-07',
      noticeUrl: 'https://dealer.example/privacy',
      decisionMethod: 'banner'
    })
    const s = snapshotConsent({ consentCookieValue: cookie, cfIpCountry: 'DE' })
    expect(s.source).toBe('explicit_cookie')
    expect(s.marketing).toBe('granted')
    expect(s.policyVersion).toBe('privacy-2026-07')
    expect(s.noticeUrl).toBe('https://dealer.example/privacy')
    expect(s.decisionMethod).toBe('banner')
  })

  it('drops unsafe notice URLs from consent evidence', () => {
    const cookie = JSON.stringify({
      tracking: true,
      analytics: true,
      marketing: true,
      updatedAt: '2026-07-25T00:00:00Z',
      noticeUrl: 'javascript:alert(1)'
    })
    expect(snapshotConsent({ consentCookieValue: cookie, cfIpCountry: 'AU' }).noticeUrl).toBeNull()
  })

  it('no region + no cookie → safest deny', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: null })
    expect(s.source).toBe('no_signal')
    expect(s.tracking).toBe('denied')
  })
})
