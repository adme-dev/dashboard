import { describe, it, expect } from 'vitest'
import { buildQr360Row, parseGaClientId } from '../../shared/qr/export360'

describe('parseGaClientId', () => {
  it('extracts the client id from a GA cookie and rejects junk', () => {
    expect(parseGaClientId('GA1.1.1273685222.1787692266')).toBe('1273685222.1787692266')
    expect(parseGaClientId('GA1.2.1.2')).toBe('1.2')
    expect(parseGaClientId('nope')).toBeNull()
    expect(parseGaClientId('')).toBeNull()
    expect(parseGaClientId(undefined)).toBeNull()
  })
})

describe('buildQr360Row', () => {
  const base = { siteId: 's', clientId: 'c', eventId: 'e', code: 'AbC1234', ipHash: 'h', occurredAt: '2026-08-26T00:00:00.000Z' as string }
  it('derives a stable pseudo anon id from the scan hash and never fingerprints', () => {
    const row = buildQr360Row({ ...base, eventName: 'qr_scan' })
    expect(row.anon_id).toBe('qr:h')
    expect(row.origin).toBe('qr')
    expect(row.utm_source).toBe('qr')
    expect(row.utm_content).toBe('AbC1234')
    expect(row.event_data).toEqual({ xf_qr: 'AbC1234', source: 'qr' })
    expect(buildQr360Row({ ...base, eventName: 'qr_scan', ipHash: null }).anon_id).toBe('qr:anon')
  })
  it('carries the arm, lead id and GA client id when present', () => {
    const row = buildQr360Row({ ...base, eventName: 'qr_lead', variant: 'B', leadId: 'L1', gaClientId: '1.2', ua: 'x'.repeat(600) })
    expect(row.event_data).toMatchObject({ xf_qr_variant: 'B', lead_id: 'L1' })
    expect(row.ga_client_id).toBe('1.2')
    expect(row.ua!.length).toBe(512)
  })
})
