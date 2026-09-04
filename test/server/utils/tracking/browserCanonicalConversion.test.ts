import { describe, expect, it } from 'vitest'
import { buildBrowserCanonicalConversion } from '~~/server/utils/tracking/browserCanonicalConversion'

const row = {
  site_id: '87754354-978b-47dd-a630-df1a1dc37101',
  client_id: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
  event_id: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
  event_name: 'generate_lead',
  occurred_at: '2026-07-20T01:00:00.000Z',
  gclid: 'approved-click-id',
  gbraid: null,
  wbraid: null,
  fbc: 'fb.1.1234567890123.approved-click',
  fbp: 'fb.1.1234567890123.browser-id',
  ttclid: 'tiktok-click-1',
  ttp: 'tiktok-browser-1',
  page_url: 'https://www.werribeetoyota.com.au/enquire?email=must-not-copy%40example.com#form',
  ua: 'Test Browser',
  event_data: { stockId: 'FORD-123', email: 'must-not-copy@example.com' }
}

describe('browser canonical conversion bridge', () => {
  it('promotes a marketing-consented generate_lead event without copying event data or PII', () => {
    const result = buildBrowserCanonicalConversion({
      row,
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({
      clientId: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
      eventName: 'web_conversion',
      sourceSystem: 'browser',
      sourceEntityType: 'tracking_event',
      sourceEntityId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
      sourceEventId: 'tracking:87754354-978b-47dd-a630-df1a1dc37101:48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
      occurredAt: '2026-07-20T01:00:00.000Z',
      consentDecision: 'granted',
      attribution: {
        browserEventId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
        metaLeadId: null,
        gclid: 'approved-click-id',
        gbraid: null,
        wbraid: null,
        fbc: 'fb.1.1234567890123.approved-click',
        fbp: 'fb.1.1234567890123.browser-id',
        ttclid: 'tiktok-click-1',
        ttp: 'tiktok-browser-1',
        gaClientId: null,
        eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
        clientUserAgent: 'Test Browser'
      }
    })
    expect(JSON.stringify(result)).not.toContain('must-not-copy@example.com')
    expect(JSON.stringify(result)).not.toContain('must-not-copy%40example.com')
    expect(JSON.stringify(result)).not.toContain('FORD-123')
  })

  it('does not promote a lead when marketing consent is denied', () => {
    expect(buildBrowserCanonicalConversion({
      row,
      marketingConsent: 'denied',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })).toBeNull()
  })

  it('does not promote ordinary behavioural events', () => {
    expect(buildBrowserCanonicalConversion({
      row: { ...row, event_name: 'page_view' },
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })).toBeNull()
  })

  it('uses the trusted receive time when the browser omits its event timestamp', () => {
    expect(buildBrowserCanonicalConversion({
      row: { ...row, occurred_at: null },
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })?.occurredAt).toBe('2026-07-20T01:00:01.000Z')
  })
})
