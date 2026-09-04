import { describe, expect, it, vi } from 'vitest'
import { createTrackingEventPersistence } from '~~/server/utils/tracking/eventPersistence'
import type { TrackingEventRow } from '~~/server/utils/tracking/event-insert'

function trackingRow(overrides: Partial<TrackingEventRow> = {}): TrackingEventRow {
  return {
    site_id: '87754354-978b-47dd-a630-df1a1dc37101',
    client_id: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
    event_id: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
    anon_id: 'anon-1',
    session_id: 'session-1',
    event_name: 'generate_lead',
    page_url: 'https://courtneyandpattersonford.com.au/new-vehicles',
    referrer: null,
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'pmax',
    utm_term: null,
    utm_content: null,
    gclid: 'approved-click-id',
    gbraid: null,
    wbraid: null,
    fbclid: null,
    fbc: null,
    fbp: null,
    ttclid: null,
    ttp: 'tiktok-browser-1',
    msclkid: null,
    li_fat_id: null,
    event_data: { stockId: 'FORD-123', email: 'must-not-promote@example.com' },
    consent: {},
    ua: 'browser',
    ip_hash: 'hash',
    origin: 'https://courtneyandpattersonford.com.au',
    occurred_at: '2026-07-20T01:00:00.000Z',
    ...overrides
  }
}

describe('tracking event persistence', () => {
  it('atomically stores a new event and appends a consented browser conversion to the governed outbox', async () => {
    const db = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => (
        sql.includes('INSERT INTO tracking_events')
          ? { rows: [{ event_id: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1' }] }
          : { rows: [] }
      ))
    }
    const appendOutbox = vi.fn().mockResolvedValue({ status: 'created' })
    const persistence = createTrackingEventPersistence({
      transaction: async callback => callback(db),
      appendOutbox,
      onPromotionError: vi.fn()
    })

    const result = await persistence.persist({
      rows: [trackingRow()],
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({ stored: 1, promoted: 1, promotionFailures: 0 })
    const insertCall = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO tracking_events'))
    expect(String(insertCall?.[0])).toContain('ttclid, ttp, msclkid')
    expect(insertCall?.[1]?.[20]).toBe('tiktok-browser-1')
    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      eventName: 'web_conversion',
      consentDecision: 'granted',
      attribution: expect.objectContaining({
        browserEventId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
        gclid: 'approved-click-id'
      })
    }))
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain('must-not-promote@example.com')
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain('FORD-123')
  })

  it('does not create a second canonical event when the browser event is a duplicate', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const appendOutbox = vi.fn()
    const persistence = createTrackingEventPersistence({
      transaction: async callback => callback(db),
      appendOutbox,
      onPromotionError: vi.fn()
    })

    const result = await persistence.persist({
      rows: [trackingRow()],
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({ stored: 0, promoted: 0, promotionFailures: 0 })
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('stores analytics while refusing conversion promotion when marketing consent is denied', async () => {
    const db = {
      query: vi.fn(async (sql: string) => (
        sql.includes('INSERT INTO tracking_events') ? { rows: [{ event_id: 'event-1' }] } : { rows: [] }
      ))
    }
    const appendOutbox = vi.fn()
    const persistence = createTrackingEventPersistence({
      transaction: async callback => callback(db),
      appendOutbox,
      onPromotionError: vi.fn()
    })

    const result = await persistence.persist({
      rows: [trackingRow()],
      marketingConsent: 'denied',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({ stored: 1, promoted: 0, promotionFailures: 0 })
    expect(appendOutbox).not.toHaveBeenCalled()
  })

  it('uses a savepoint so an outbox failure cannot roll back the accepted tracking event', async () => {
    const db = {
      query: vi.fn(async (sql: string) => (
        sql.includes('INSERT INTO tracking_events') ? { rows: [{ event_id: 'event-1' }] } : { rows: [] }
      ))
    }
    const onPromotionError = vi.fn()
    const persistence = createTrackingEventPersistence({
      transaction: async callback => callback(db),
      appendOutbox: vi.fn().mockRejectedValue(new Error('database detail must stay server-side')),
      onPromotionError
    })

    const result = await persistence.persist({
      rows: [trackingRow()],
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({ stored: 1, promoted: 0, promotionFailures: 1 })
    const sql = db.query.mock.calls.map(call => String(call[0]))
    expect(sql).toContain('SAVEPOINT browser_conversion_promotion')
    expect(sql).toContain('ROLLBACK TO SAVEPOINT browser_conversion_promotion')
    expect(sql).toContain('RELEASE SAVEPOINT browser_conversion_promotion')
    expect(onPromotionError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      clientId: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
      eventId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1'
    }))
  })
})
