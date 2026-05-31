import { describe, it, expect } from 'vitest'
import { buildEventRows } from '../../../../server/utils/tracking/event-insert'

describe('buildEventRows', () => {
  const site = { id: 'site-1', clientId: 'client-1' } as any
  const ctx = { ua: 'UA', ipHash: 'iphash', origin: 'https://www.kia.gws.com.au', consent: { tracking: 'granted' } }
  const payload = { events: [{
    event_id: 'e1', event_name: 'page_view', anon_id: 'a1', session_id: 's1',
    page_url: 'https://www.kia.gws.com.au/', referrer: null, occurred_at: 1748600000000,
    attribution: { gclid: 'G', utm_source: 'google' }, event_data: { depth: 25 }
  }] } as any

  it('produces one parameter tuple per event with flattened attribution', () => {
    const rows = buildEventRows(site, payload, ctx)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.site_id).toBe('site-1')
    expect(r.client_id).toBe('client-1')
    expect(r.event_id).toBe('e1')
    expect(r.gclid).toBe('G')
    expect(r.utm_source).toBe('google')
    expect(r.origin).toBe('https://www.kia.gws.com.au')
    expect(r.event_data).toEqual({ depth: 25 })
    expect(typeof r.occurred_at).toBe('string') // ISO string for TIMESTAMPTZ
  })
})
