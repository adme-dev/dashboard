import { queryRows as defaultQueryRows } from '~~/server/utils/db'
import {
  EXPECTED_DEALER_CONVERSIONS,
  reconcileMeasurementIdentity
} from '~~/server/utils/measurement/reconciliation'
import type { CanonicalEventName, MeasurementEnquiryType } from '~~/server/utils/measurement/contracts'

interface EvidenceRow {
  canonical_event_name: CanonicalEventName
  enquiry_type: MeasurementEnquiryType | null
  captured_count: number | string
  consent_denied_count: number | string
  latest_evidence_at: Date | string | null
  delivery_attempted: number | string
  delivered: number | string
  failed: number | string
  provider_accepted: number | string
  provider_reporting_observed: number | string
}

interface MappingRow {
  canonical_event_name: CanonicalEventName
  enquiry_type: MeasurementEnquiryType | null
  platform: string
  provider_event_name: string | null
  account_id: string | null
}

interface ReconciliationRepositoryDependencies {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface ListMeasurementReconciliationInput {
  clientId: string
  expectedAccountCustomerId?: string | null
  expectedAccountLabel?: string
  now?: Date
}

function identityKey(canonicalEventName: string, enquiryType: string | null) {
  return `${canonicalEventName}:${enquiryType ?? '__none__'}`
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export function createMeasurementReconciliationRepository(
  dependencies: ReconciliationRepositoryDependencies = { queryRows: defaultQueryRows }
) {
  return {
    async list(input: ListMeasurementReconciliationInput) {
      const evidenceRows = await dependencies.queryRows<EvidenceRow>(
        `SELECT e.canonical_event_name, e.enquiry_type,
                COUNT(DISTINCT e.id) AS captured_count,
                COUNT(DISTINCT e.id) FILTER (
                  WHERE e.advertising_consent = 'denied'
                ) AS consent_denied_count,
                MAX(e.received_at) AS latest_evidence_at,
                COUNT(s.id) FILTER (
                  WHERE s.destination = 'google_ads' AND s.stage = 'delivery_attempted'
                ) AS delivery_attempted,
                COUNT(s.id) FILTER (
                  WHERE s.destination = 'google_ads' AND s.outcome = 'delivered'
                ) AS delivered,
                COUNT(s.id) FILTER (
                  WHERE s.destination = 'google_ads' AND s.outcome = 'failed'
                ) AS failed,
                COUNT(s.id) FILTER (
                  WHERE s.destination = 'google_ads' AND s.stage = 'provider_accepted' AND s.outcome = 'accepted'
                ) AS provider_accepted,
                COUNT(s.id) FILTER (
                  WHERE s.destination = 'google_ads' AND s.stage = 'provider_reporting_observed' AND s.outcome = 'reported'
                ) AS provider_reporting_observed
           FROM measurement_evidence_events e
           LEFT JOIN measurement_evidence_stages s
             ON s.client_id = e.client_id AND s.evidence_event_id = e.id
          WHERE e.client_id = $1
          GROUP BY e.canonical_event_name, e.enquiry_type`,
        [input.clientId]
      )
      const mappingRows = await dependencies.queryRows<MappingRow>(
        `SELECT m.canonical_event_name, m.enquiry_type, d.platform,
                m.provider_event_name, d.account_id
           FROM conversion_event_mappings m
           JOIN conversion_destinations d
             ON d.client_id = m.client_id AND d.id = m.destination_id
          WHERE m.client_id = $1
            AND m.is_active = TRUE
            AND d.enabled = TRUE
            AND d.environment IN ('test', 'live')
            AND d.platform = 'google_ads'
          ORDER BY m.created_at DESC`,
        [input.clientId]
      )

      const evidenceByIdentity = new Map(evidenceRows.map(row => [
        identityKey(row.canonical_event_name, row.enquiry_type), row
      ]))
      const mappingByIdentity = new Map<string, MappingRow>()
      for (const row of mappingRows) {
        const key = identityKey(row.canonical_event_name, row.enquiry_type)
        if (!mappingByIdentity.has(key)) mappingByIdentity.set(key, row)
      }

      const items = EXPECTED_DEALER_CONVERSIONS.map((identity) => {
        const key = identityKey(identity.canonicalEventName, identity.enquiryType)
        const evidence = evidenceByIdentity.get(key)
        const mapping = mappingByIdentity.get(key)
        return reconcileMeasurementIdentity({
          identity,
          capturedCount: Number(evidence?.captured_count ?? 0),
          consentDeniedCount: Number(evidence?.consent_denied_count ?? 0),
          latestEvidenceAt: iso(evidence?.latest_evidence_at ?? null),
          destination: mapping
            ? {
                configured: true,
                platform: mapping.platform,
                providerEventName: mapping.provider_event_name,
                accountId: mapping.account_id
              }
            : {
                configured: false,
                platform: 'google_ads',
                providerEventName: null,
                accountId: null
              },
          stages: {
            deliveryAttempted: Number(evidence?.delivery_attempted ?? 0),
            delivered: Number(evidence?.delivered ?? 0),
            failed: Number(evidence?.failed ?? 0),
            providerAccepted: Number(evidence?.provider_accepted ?? 0),
            providerReportingObserved: Number(evidence?.provider_reporting_observed ?? 0)
          },
          expectedAccountCustomerId: input.expectedAccountCustomerId,
          expectedAccountLabel: input.expectedAccountLabel,
          now: input.now
        })
      })
      return {
        clientId: input.clientId,
        expectedAccountCustomerId: input.expectedAccountCustomerId ?? null,
        items,
        summary: items.reduce((counts, item) => {
          counts[item.state] = (counts[item.state] ?? 0) + 1
          return counts
        }, {} as Record<string, number>)
      }
    }
  }
}

export const measurementReconciliationRepository = createMeasurementReconciliationRepository()
