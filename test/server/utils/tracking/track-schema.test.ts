import { describe, it, expect } from 'vitest'
import { parseTrackPayload, TRACK_EVENT_NAMES } from '../../../../server/utils/tracking/track-schema'

const valid = {
  events: [{
    event_id: 'evt_abc123',
    event_name: 'page_view',
    anon_id: 'anon_1',
    session_id: 'sess_1',
    page_url: 'https://www.kia.gws.com.au/',
    referrer: 'https://www.google.com/',
    occurred_at: 1748600000000,
    attribution: { gclid: 'G123', utm_source: 'google' },
    event_data: { depth: 50 }
  }]
}

describe('parseTrackPayload — consent forwarding', () => {
  it('accepts an optional batch-level consent string and exposes it', () => {
    const cookie = JSON.stringify({ tracking: true, analytics: true, marketing: false, updatedAt: '2026-05-31T00:00:00Z' })
    const r = parseTrackPayload({ ...valid, consent: cookie })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.consent).toBe(cookie)
  })
  it('still accepts a batch with no consent (consent is optional)', () => {
    const r = parseTrackPayload(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.consent ?? null).toBe(null)
  })
  it('rejects an over-long consent value', () => {
    const r = parseTrackPayload({ ...valid, consent: 'x'.repeat(5000) })
    expect(r.ok).toBe(false)
  })
})

describe('parseTrackPayload', () => {
  it('accepts a well-formed batch', () => {
    const r = parseTrackPayload(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.events).toHaveLength(1)
      expect(r.payload.events[0].event_name).toBe('page_view')
    }
  })

  it('accepts email click IDs in attribution for email campaign joins', () => {
    const r = parseTrackPayload({
      events: [{
        ...valid.events[0],
        attribution: {
          ...valid.events[0].attribution,
          email_click_id: 'click-1'
        }
      }]
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.events[0].attribution?.email_click_id).toBe('click-1')
  })

  it('accepts a bounded TikTok browser identifier', () => {
    const r = parseTrackPayload({
      events: [{
        ...valid.events[0],
        attribution: {
          ...valid.events[0].attribution,
          ttclid: 'tiktok-click-1',
          ttp: 'tiktok-browser-1'
        }
      }]
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.events[0].attribution).toMatchObject({
        ttclid: 'tiktok-click-1',
        ttp: 'tiktok-browser-1'
      })
    }
  })

  it('rejects an over-long TikTok browser identifier', () => {
    const r = parseTrackPayload({
      events: [{
        ...valid.events[0],
        attribution: {
          ...valid.events[0].attribution,
          ttp: 'x'.repeat(513)
        }
      }]
    })

    expect(r.ok).toBe(false)
  })

  it('rejects an event with empty event_id (Pitfall 4)', () => {
    const bad = { events: [{ ...valid.events[0], event_id: '' }] }
    const r = parseTrackPayload(bad)
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown event_name', () => {
    const bad = { events: [{ ...valid.events[0], event_name: 'launch_rocket' }] }
    const r = parseTrackPayload(bad)
    expect(r.ok).toBe(false)
  })

  it('rejects a non-object / null body without throwing', () => {
    expect(parseTrackPayload(null).ok).toBe(false)
    expect(parseTrackPayload('nope').ok).toBe(false)
  })

  it('caps batch size at 50 events', () => {
    const many = { events: Array.from({ length: 51 }, () => valid.events[0]) }
    expect(parseTrackPayload(many).ok).toBe(false)
  })

  it('exposes the reserved event-name set for forward-compat (Slice 4 signals)', () => {
    expect(TRACK_EVENT_NAMES).toContain('vehicle_view')
    expect(TRACK_EVENT_NAMES).toContain('form_submit')
  })
})
