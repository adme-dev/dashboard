import { describe, it, expect } from 'vitest'
import { buildEventRows } from '../../../../server/utils/tracking/event-insert'
import type { EventContext } from '../../../../server/utils/tracking/event-insert'
import type { TrackPayload } from '../../../../server/utils/tracking/track-schema'
import type { TrackingSite } from '../../../../server/utils/tracking/site-config'

describe('buildEventRows', () => {
  const site: Pick<TrackingSite, 'id' | 'clientId'> = { id: 'site-1', clientId: 'client-1' }
  const ctx: EventContext = { ua: 'UA', ipHash: 'iphash', origin: 'https://www.kia.gws.com.au', consent: { tracking: 'granted' } }
  const payload: TrackPayload = { events: [{
    event_id: 'e1', event_name: 'page_view', anon_id: 'a1', session_id: 's1',
    page_url: 'https://www.kia.gws.com.au/', referrer: null, occurred_at: 1748600000000,
    attribution: { gclid: 'G', utm_source: 'google', ttp: 'tiktok-browser-1' }, event_data: { depth: 25 }
  }] }

  it('produces one parameter tuple per event with flattened attribution', () => {
    const rows = buildEventRows(site, payload, ctx)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.site_id).toBe('site-1')
    expect(r.client_id).toBe('client-1')
    expect(r.event_id).toBe('e1')
    expect(r.gclid).toBe('G')
    expect(r.ttp).toBe('tiktok-browser-1')
    expect(r.utm_source).toBe('google')
    expect(r.origin).toBe('https://www.kia.gws.com.au')
    expect(r.event_data).toEqual({ depth: 25 })
    expect(typeof r.occurred_at).toBe('string') // ISO string for TIMESTAMPTZ
  })

  it('copies email click IDs from attribution into event_data for report joins', () => {
    const rows = buildEventRows(site, {
      events: [{
        ...payload.events[0],
        attribution: {
          ...payload.events[0].attribution,
          email_click_id: 'click-1'
        },
        event_data: { depth: 25 }
      }]
    }, ctx)

    expect(rows[0].event_data).toEqual({
      depth: 25,
      email_click_id: 'click-1'
    })
  })
})
