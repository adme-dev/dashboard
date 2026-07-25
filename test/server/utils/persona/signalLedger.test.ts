import { describe, expect, it } from 'vitest'
import {
  classifyCustomerSignal,
  hashPersonaSubject,
  safePagePath,
  sanitizeTrackingSignalContext
} from '../../../../server/utils/persona/signalLedger'
import type { TrackingEventRow } from '../../../../server/utils/tracking/event-insert'

function row(overrides: Partial<TrackingEventRow> = {}): TrackingEventRow {
  return {
    site_id: 'site-1',
    client_id: 'client-1',
    event_id: 'event-1',
    anon_id: 'anon-1',
    session_id: 'session-1',
    event_name: 'vehicle_view',
    page_url: 'https://dealer.example/cars/car-1?email=hidden@example.com',
    referrer: 'https://www.google.com/search?q=private',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'winter-stock',
    utm_term: null,
    utm_content: null,
    gclid: 'click-1',
    gbraid: null,
    wbraid: null,
    fbclid: null,
    fbc: null,
    fbp: null,
    ttclid: null,
    msclkid: null,
    li_fat_id: null,
    event_data: {
      vehicle_id: 'vehicle-1',
      vehicle_make: 'Toyota',
      email: 'must-not-be-copied@example.com',
      free_text: 'must not be copied'
    },
    consent: { marketing: 'granted' },
    ua: null,
    ip_hash: null,
    origin: 'https://dealer.example',
    occurred_at: '2026-07-25T00:00:00.000Z',
    ...overrides
  }
}

describe('persona signal ledger transforms', () => {
  it('creates deterministic tenant-scoped subject hashes', async () => {
    const first = await hashPersonaSubject('client-a', 'anon', 'visitor-1')
    const same = await hashPersonaSubject('client-a', 'anon', 'visitor-1')
    const otherTenant = await hashPersonaSubject('client-b', 'anon', 'visitor-1')

    expect(first).toBe(same)
    expect(first).not.toBe(otherTenant)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('removes URL query data and unapproved event fields', () => {
    const context = sanitizeTrackingSignalContext(row())

    expect(context.pagePath).toBe('https://dealer.example/cars/car-1')
    expect(context.referrerHost).toBe('www.google.com')
    expect(context.vehicle_id).toBe('vehicle-1')
    expect(context.vehicle_make).toBe('Toyota')
    expect(context).not.toHaveProperty('email')
    expect(context).not.toHaveProperty('free_text')
    expect(JSON.stringify(context)).not.toContain('hidden@example.com')
  })

  it('classifies behavioural, intent, conversion and lifecycle signals', () => {
    expect(classifyCustomerSignal('page_view')).toBe('behaviour')
    expect(classifyCustomerSignal('vehicle_view')).toBe('intent')
    expect(classifyCustomerSignal('generate_lead')).toBe('conversion')
    expect(classifyCustomerSignal('sold')).toBe('lifecycle')
  })

  it('strips query strings from malformed-but-usable page values', () => {
    expect(safePagePath('/cars/one?email=hidden#section')).toBe('/cars/one')
  })
})
