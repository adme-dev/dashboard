import {
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import {
  hashDealerEvidenceNonce,
  type DealerEvidenceEndpoint,
  type PersistDealerEvidenceInput,
  type PersistDealerEvidenceResult
} from '~~/server/utils/measurement/dealerEvidence'

interface EndpointRow {
  id: string
  client_id: string
  profile_id: string
  endpoint_key: string
  source_system: string
  status: DealerEvidenceEndpoint['status']
  replay_window_seconds: number | string
  tracking_site_id: string | null
  current_secret_ref: string
  previous_secret_ref: string | null
  previous_secret_valid_until: Date | string | null
  allow_server_delivery: boolean
  browser_server_dedup_validated: boolean
}

type QueryResult = { rows?: unknown[], rowCount?: number | null }
type TransactionDb = { query(sql: string, params?: unknown[]): Promise<QueryResult> }

interface DealerEvidenceRepositoryDependencies {
  queryOne: typeof defaultQueryOne
  transaction<T>(callback: (db: TransactionDb) => Promise<T>): Promise<T>
  resolveSecret(reference: string): Promise<string | null> | string | null
}

function dateOrNull(value: Date | string | null): Date | null {
  return value === null ? null : new Date(value)
}

export function createPostgresDealerEvidenceRepository(
  dependencies: DealerEvidenceRepositoryDependencies
) {
  return {
    async resolveEndpoint(endpointKey: string): Promise<DealerEvidenceEndpoint | null> {
      const row = await dependencies.queryOne<EndpointRow>(
        `SELECT oe.id, oe.client_id, oe.profile_id, oe.endpoint_key,
                oe.source_system, oe.status, oe.replay_window_seconds,
                p.tracking_site_id, oe.current_secret_ref,
                oe.previous_secret_ref, oe.previous_secret_valid_until,
                oe.allow_server_delivery, oe.browser_server_dedup_validated
           FROM outcome_endpoints oe
           JOIN client_measurement_profiles p
             ON p.client_id = oe.client_id AND p.id = oe.profile_id
          WHERE oe.endpoint_key = $1`,
        [endpointKey]
      )
      if (!row) return null
      const currentSecret = await dependencies.resolveSecret(row.current_secret_ref)
      if (!currentSecret) return null
      const previousSecret = row.previous_secret_ref
        ? await dependencies.resolveSecret(row.previous_secret_ref)
        : null
      return {
        id: row.id,
        clientId: row.client_id,
        profileId: row.profile_id,
        endpointKey: row.endpoint_key,
        sourceSystem: row.source_system,
        status: row.status,
        replayWindowSeconds: Number(row.replay_window_seconds),
        trackingSiteId: row.tracking_site_id,
        currentSecret,
        previousSecret,
        previousSecretValidUntil: dateOrNull(row.previous_secret_valid_until),
        allowServerDelivery: row.allow_server_delivery,
        browserServerDedupValidated: row.browser_server_dedup_validated
      }
    },

    async persist(input: PersistDealerEvidenceInput): Promise<PersistDealerEvidenceResult> {
      return await dependencies.transaction(async (db) => {
        const existing = await db.query(
          `SELECT id
             FROM measurement_evidence_events
            WHERE client_id = $1 AND source_system = $2 AND source_event_id = $3`,
          [input.endpoint.clientId, input.endpoint.sourceSystem, input.payload.eventId]
        )
        if ((existing.rows?.length ?? 0) > 0) return { status: 'duplicate' as const }

        const nonce = await db.query(
          `INSERT INTO measurement_evidence_nonces (
             client_id, endpoint_id, nonce_sha256, expires_at
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (endpoint_id, nonce_sha256) DO NOTHING
           RETURNING id`,
          [
            input.endpoint.clientId,
            input.endpoint.id,
            hashDealerEvidenceNonce(input.nonce),
            input.nonceExpiresAt
          ]
        )
        if ((nonce.rows?.length ?? 0) === 0) return { status: 'replay' as const }

        const call = input.payload.call
        const inserted = await db.query(
          `INSERT INTO measurement_evidence_events (
             client_id, profile_id, endpoint_id, source_system,
             source_event_id, external_site_id, browser_transaction_id,
             canonical_event_name, enquiry_type, conversion_value, currency,
             occurred_at, received_at, analytics_consent, advertising_consent,
             call_id, call_status, call_duration_seconds,
             call_qualification_threshold_seconds, call_qualified,
             call_campaign_resource_name, call_ad_resource_name
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
           )
           ON CONFLICT (client_id, source_system, source_event_id) DO NOTHING
           RETURNING id`,
          [
            input.endpoint.clientId,
            input.endpoint.profileId,
            input.endpoint.id,
            input.endpoint.sourceSystem,
            input.payload.eventId,
            input.payload.siteId,
            input.payload.browserTransactionId ?? null,
            input.payload.event.name,
            input.payload.event.enquiryType ?? null,
            input.payload.event.value ?? null,
            input.payload.event.currency ?? null,
            input.payload.occurredAt,
            input.receivedAt,
            input.payload.consent.analytics,
            input.payload.consent.advertising,
            call?.id ?? null,
            call?.status ?? null,
            call?.durationSeconds ?? null,
            call?.qualificationThresholdSeconds ?? null,
            call?.qualified ?? null,
            call?.campaignResourceName ?? null,
            call?.adResourceName ?? null
          ]
        )
        const evidenceEvent = inserted.rows?.[0] as { id?: string } | undefined
        if (!evidenceEvent?.id) return { status: 'duplicate' as const }

        for (const stage of input.payload.evidence) {
          await db.query(
            `INSERT INTO measurement_evidence_stages (
               client_id, evidence_event_id, stage, outcome, destination,
               delivery_channel, provider_action_resource_name,
               provider_event_id, diagnostic_code, occurred_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              input.endpoint.clientId,
              evidenceEvent.id,
              stage.stage,
              stage.outcome,
              stage.destination ?? null,
              stage.channel ?? null,
              stage.providerActionResourceName ?? null,
              stage.providerEventId ?? null,
              stage.diagnosticCode ?? null,
              stage.occurredAt ?? null
            ]
          )
        }
        await db.query(
          `UPDATE outcome_endpoints
              SET last_received_at = $3, updated_at = NOW()
            WHERE client_id = $1 AND id = $2`,
          [input.endpoint.clientId, input.endpoint.id, input.receivedAt]
        )
        return { status: 'created' as const }
      })
    }
  }
}

export function createDefaultDealerEvidenceRepository(
  resolveSecret: (reference: string) => Promise<string | null> | string | null
) {
  return createPostgresDealerEvidenceRepository({
    queryOne: defaultQueryOne,
    transaction: defaultTransaction as unknown as DealerEvidenceRepositoryDependencies['transaction'],
    resolveSecret
  })
}
