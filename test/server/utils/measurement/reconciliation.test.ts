import { describe, expect, it } from 'vitest'
import {
  EXPECTED_DEALER_CONVERSIONS,
  reconcileMeasurementIdentity
} from '~~/server/utils/measurement/reconciliation'

const base = {
  identity: { canonicalEventName: 'phone_click' as const, enquiryType: null },
  capturedCount: 3,
  consentDeniedCount: 0,
  latestEvidenceAt: '2026-09-02T04:55:00.000Z',
  destination: {
    configured: true,
    platform: 'google_ads',
    providerEventName: 'Phone click',
    accountId: '7583977544'
  },
  stages: {
    deliveryAttempted: 1,
    delivered: 1,
    failed: 0,
    providerAccepted: 0,
    providerReportingObserved: 0
  },
  expectedAccountCustomerId: '7583977544',
  now: new Date('2026-09-02T05:00:00.000Z')
}

describe('measurement evidence reconciliation', () => {
  it('enumerates all eight expected dealer conversion identities', () => {
    expect(EXPECTED_DEALER_CONVERSIONS).toHaveLength(8)
    expect(EXPECTED_DEALER_CONVERSIONS).toContainEqual({
      canonicalEventName: 'web_conversion', enquiryType: 'service_booking'
    })
    expect(EXPECTED_DEALER_CONVERSIONS).toContainEqual({
      canonicalEventName: 'directions_click', enquiryType: null
    })
  })

  it.each([
    [{ ...base, capturedCount: 0, latestEvidenceAt: null }, 'not_observed'],
    [{ ...base, consentDeniedCount: 3, stages: { ...base.stages, deliveryAttempted: 0, delivered: 0 } }, 'consent_denied'],
    [{ ...base, destination: { ...base.destination, configured: false } }, 'destination_not_configured'],
    [{ ...base, stages: { ...base.stages, deliveryAttempted: 0, delivered: 0 } }, 'pending'],
    [{ ...base, stages: { ...base.stages, delivered: 0, failed: 1 } }, 'failed'],
    [base, 'delivered'],
    [{ ...base, stages: { ...base.stages, providerAccepted: 1 } }, 'provider_accepted'],
    [{ ...base, stages: { ...base.stages, providerAccepted: 1 }, latestEvidenceAt: '2026-08-31T05:00:00.000Z' }, 'provider_reporting_pending'],
    [{ ...base, stages: { ...base.stages, providerAccepted: 1, providerReportingObserved: 1 } }, 'provider_accepted']
  ] as const)('derives an actionable %s state', (input, state) => {
    expect(reconcileMeasurementIdentity(input).state).toBe(state)
  })

  it('reports account mismatches as known evidence, not an inferred success', () => {
    const result = reconcileMeasurementIdentity({
      ...base,
      destination: { ...base.destination, accountId: '6692975433' }
    })
    expect(result.state).toBe('destination_not_configured')
    expect(result.blockers).toContain('account_mismatch')
    expect(result.diagnostic).toContain('Northern GAC')
    expect(result.known).toContain('Mapped Google Ads customer: 6692975433')
  })

  it('marks old capture evidence stale before treating it as current delivery proof', () => {
    const result = reconcileMeasurementIdentity({
      ...base,
      stages: { ...base.stages, providerAccepted: 0 },
      latestEvidenceAt: '2026-08-25T05:00:00.000Z'
    })
    expect(result.state).toBe('stale')
    expect(result.blockers).toContain('website_evidence_stale')
  })
})
