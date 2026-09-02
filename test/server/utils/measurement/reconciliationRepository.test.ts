import { describe, expect, it, vi } from 'vitest'
import { createMeasurementReconciliationRepository } from '~~/server/utils/measurement/reconciliationRepository'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'

describe('measurement reconciliation repository', () => {
  it('returns every expected identity and keeps all reads tenant scoped', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([{
        canonical_event_name: 'phone_click',
        enquiry_type: null,
        captured_count: '4',
        consent_denied_count: '0',
        latest_evidence_at: '2026-09-02T04:55:00.000Z',
        delivery_attempted: '4',
        delivered: '4',
        failed: '0',
        provider_accepted: '0',
        provider_reporting_observed: '0'
      }])
      .mockResolvedValueOnce([{
        canonical_event_name: 'phone_click',
        enquiry_type: null,
        platform: 'google_ads',
        provider_event_name: 'Phone click',
        account_id: '7583977544'
      }])
    const repository = createMeasurementReconciliationRepository({ queryRows })

    const result = await repository.list({
      clientId: CLIENT_ID,
      expectedAccountCustomerId: '7583977544',
      now: new Date('2026-09-02T05:00:00.000Z')
    })

    expect(result.items).toHaveLength(8)
    expect(result.items.find(item => item.identity.canonicalEventName === 'phone_click'))
      .toMatchObject({ state: 'delivered', capturedCount: 4 })
    expect(queryRows).toHaveBeenCalledTimes(2)
    expect(queryRows.mock.calls.every((call: unknown[]) => (call[1] as unknown[])[0] === CLIENT_ID)).toBe(true)
  })

  it('does not use an aggregate web-conversion mapping for typed dealer events', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([{
        canonical_event_name: 'web_conversion', enquiry_type: 'stock', captured_count: '1',
        consent_denied_count: '0', latest_evidence_at: '2026-09-02T04:55:00.000Z',
        delivery_attempted: '0', delivered: '0', failed: '0', provider_accepted: '0',
        provider_reporting_observed: '0'
      }])
      .mockResolvedValueOnce([{
        canonical_event_name: 'web_conversion', enquiry_type: null, platform: 'google_ads',
        provider_event_name: 'All website leads', account_id: '7583977544'
      }])
    const repository = createMeasurementReconciliationRepository({ queryRows })

    const result = await repository.list({ clientId: CLIENT_ID })
    expect(result.items.find(item => item.identity.enquiryType === 'stock')).toMatchObject({
      state: 'destination_not_configured',
      blockers: ['destination_not_configured']
    })
  })
})
