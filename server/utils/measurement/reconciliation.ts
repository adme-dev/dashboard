import type {
  CanonicalEventName,
  MeasurementEnquiryType
} from '~~/server/utils/measurement/contracts'

export const EXPECTED_DEALER_CONVERSIONS: ReadonlyArray<{
  canonicalEventName: CanonicalEventName
  enquiryType: MeasurementEnquiryType | null
}> = [
  { canonicalEventName: 'web_conversion', enquiryType: 'stock' },
  { canonicalEventName: 'web_conversion', enquiryType: 'finance' },
  { canonicalEventName: 'web_conversion', enquiryType: 'test_drive' },
  { canonicalEventName: 'web_conversion', enquiryType: 'contact' },
  { canonicalEventName: 'web_conversion', enquiryType: 'model_variant' },
  { canonicalEventName: 'web_conversion', enquiryType: 'service_booking' },
  { canonicalEventName: 'phone_click', enquiryType: null },
  { canonicalEventName: 'directions_click', enquiryType: null }
]

export type MeasurementReconciliationState
  = 'not_observed'
    | 'captured'
    | 'consent_denied'
    | 'destination_not_configured'
    | 'pending'
    | 'delivered'
    | 'provider_accepted'
    | 'provider_reporting_pending'
    | 'failed'
    | 'stale'

export interface MeasurementReconciliationInput {
  identity: {
    canonicalEventName: CanonicalEventName
    enquiryType: MeasurementEnquiryType | null
  }
  capturedCount: number
  consentDeniedCount: number
  latestEvidenceAt: string | null
  destination: null | {
    configured: boolean
    platform: string
    providerEventName: string | null
    accountId: string | null
  }
  stages: {
    deliveryAttempted: number
    delivered: number
    failed: number
    providerAccepted: number
    providerReportingObserved: number
  }
  expectedAccountCustomerId?: string | null
  expectedAccountLabel?: string
  now?: Date
  staleAfterHours?: number
  reportingPendingAfterHours?: number
}

function label(input: MeasurementReconciliationInput): string {
  if (input.identity.canonicalEventName === 'web_conversion') {
    return (input.identity.enquiryType ?? 'website').replaceAll('_', ' ')
  }
  return input.identity.canonicalEventName.replaceAll('_', ' ')
}

function hoursSince(value: string | null, now: Date): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) / 3_600_000 : null
}

export function reconcileMeasurementIdentity(input: MeasurementReconciliationInput) {
  const known = [`Captured events: ${input.capturedCount}`]
  const inferred: string[] = []
  const blockers: string[] = []
  const eventLabel = label(input)
  const now = input.now ?? new Date()
  const ageHours = hoursSince(input.latestEvidenceAt, now)

  if (input.latestEvidenceAt) known.push(`Latest website evidence: ${input.latestEvidenceAt}`)
  if (input.destination?.accountId) known.push(`Mapped Google Ads customer: ${input.destination.accountId}`)

  let state: MeasurementReconciliationState
  let diagnostic: string
  if (
    input.expectedAccountCustomerId
    && input.destination?.accountId
    && input.destination.accountId.replaceAll('-', '') !== input.expectedAccountCustomerId.replaceAll('-', '')
  ) {
    state = 'destination_not_configured'
    blockers.push('account_mismatch')
    diagnostic = `Dealer event resolved to customer ${input.destination.accountId} instead of ${input.expectedAccountLabel ?? 'Northern GAC'} (${input.expectedAccountCustomerId}).`
  } else if (input.capturedCount === 0) {
    state = 'not_observed'
    diagnostic = `No ${eventLabel} evidence has been observed.`
  } else if (ageHours !== null && ageHours > (input.staleAfterHours ?? 168)) {
    state = 'stale'
    blockers.push('website_evidence_stale')
    diagnostic = `${eventLabel} evidence is stale; the last observed event was ${Math.floor(ageHours)} hours ago.`
  } else if (input.consentDeniedCount >= input.capturedCount) {
    state = 'consent_denied'
    known.push(`Advertising consent denied: ${input.consentDeniedCount}`)
    diagnostic = `${eventLabel} was captured, but advertising delivery was denied by consent.`
  } else if (input.destination === null) {
    state = 'captured'
    inferred.push('Destination configuration has not been evaluated.')
    diagnostic = `${eventLabel} was captured; destination configuration is not yet known.`
  } else if (!input.destination.configured || !input.destination.providerEventName) {
    state = 'destination_not_configured'
    blockers.push('destination_not_configured')
    diagnostic = `${eventLabel} events were captured; no Google Ads website action is mapped.`
  } else if (input.stages.deliveryAttempted === 0) {
    state = 'pending'
    blockers.push('delivery_evidence_missing')
    diagnostic = 'Website action mapped; no browser-delivery evidence received.'
  } else if (input.stages.failed > 0 && input.stages.delivered === 0) {
    state = 'failed'
    blockers.push('delivery_failed')
    diagnostic = `${eventLabel} delivery was attempted and failed.`
  } else if (input.stages.providerReportingObserved > 0) {
    state = 'provider_accepted'
    known.push('Provider reporting was observed.')
    diagnostic = `${eventLabel} was delivered, accepted, and observed in provider reporting.`
  } else if (input.stages.providerAccepted > 0) {
    if (ageHours !== null && ageHours > (input.reportingPendingAfterHours ?? 24)) {
      state = 'provider_reporting_pending'
      blockers.push('provider_reporting_pending')
      diagnostic = `${eventLabel} was accepted by the provider; reporting evidence is still pending.`
    } else {
      state = 'provider_accepted'
      diagnostic = `${eventLabel} was accepted by the provider; reporting is not yet inferred.`
    }
  } else if (input.stages.delivered > 0) {
    state = 'delivered'
    diagnostic = `${eventLabel} has browser-delivery evidence; provider acceptance is not yet known.`
  } else {
    state = 'pending'
    diagnostic = `${eventLabel} delivery has been attempted and is pending.`
  }

  return {
    identity: input.identity,
    state,
    diagnostic,
    known,
    inferred,
    blockers,
    capturedCount: input.capturedCount,
    latestEvidenceAt: input.latestEvidenceAt,
    destination: input.destination,
    stages: input.stages
  }
}
