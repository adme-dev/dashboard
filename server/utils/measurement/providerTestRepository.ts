import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  resolveGoogleRefreshToken,
  type GoogleRefreshCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'
import type {
  MeasurementProviderTestInput,
  MeasurementProviderTestRepository,
  ProviderTestMode,
  ProviderTestRunSummary,
  ReserveProviderTestResult
} from '~~/server/utils/measurement/providerTestService'

interface QueryResult {
  rows?: unknown[]
  rowCount?: number | null
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

interface ProviderContextRow extends GoogleRefreshCredentialRow {
  id: string
  profile_id: string
  profile_enabled: boolean
  profile_environment: string
  profile_config_version: number | string
  destination_enabled: boolean
  destination_environment: string
  platform: 'meta' | 'google_data_manager' | 'tiktok'
  external_destination_id: string
  credential_ref: string | null
  provider_event_name: string | null
  account_id: string | null
  refresh_token: string | null
  scopes: unknown
  metadata: unknown
  allowed_origins: unknown
  capability_modes: unknown
}

interface TestRunRow {
  id: string
  mode: ProviderTestMode
  status: 'requested' | 'accepted' | 'failed'
  provider_request_id: string | null
  error_class: string | null
  redacted_error: string | null
  completed_at: Date | string | null
}

type Transaction = <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function runSummary(row: TestRunRow): ProviderTestRunSummary {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    providerRequestId: row.provider_request_id,
    errorClass: row.error_class,
    redactedError: row.redacted_error,
    completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString()
  }
}

function expectedPlatform(mode: ProviderTestMode) {
  if (mode === 'meta_test_events') return 'meta'
  if (mode === 'tiktok_test_events') return 'tiktok'
  return 'google_data_manager'
}

function normalizedOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

export function createPostgresMeasurementProviderTestRepository(
  transaction: Transaction = defaultTransaction as unknown as Transaction,
  resolveRefreshToken: typeof resolveGoogleRefreshToken = resolveGoogleRefreshToken
): MeasurementProviderTestRepository {
  return {
    async reserve(input: MeasurementProviderTestInput): Promise<ReserveProviderTestResult> {
      return transaction(async (db) => {
        const existingResult = await db.query(
          `SELECT id, mode, status, provider_request_id, error_class, redacted_error, completed_at
             FROM measurement_provider_test_runs
            WHERE client_id = $1
              AND idempotency_key = $2`,
          [input.clientId, input.idempotencyKey]
        )
        const existing = existingResult.rows?.[0] as TestRunRow | undefined
        if (existing) return { status: 'existing', run: runSummary(existing) }

        const contextResult = await db.query(
          `SELECT p.id AS profile_id,
                  p.enabled AS profile_enabled,
                  p.environment AS profile_environment,
                  p.config_version AS profile_config_version,
                  d.enabled AS destination_enabled,
                  d.environment AS destination_environment,
                  d.platform,
                  d.external_destination_id,
                  d.credential_ref,
                  m.provider_event_name,
                  sc.id,
                  sc.account_id,
                  sc.refresh_token,
                  sc.google_credential_profile_id,
                  gcp.refresh_token_encrypted AS profile_refresh_token_encrypted,
                  gcp.refresh_token_iv AS profile_refresh_token_iv,
                  sc.scopes,
                  sc.metadata,
                  ts.allowed_origins,
                  caps.capability_modes
             FROM conversion_destinations d
             JOIN client_measurement_profiles p
               ON p.client_id = d.client_id
              AND p.id = d.profile_id
             LEFT JOIN conversion_event_mappings m
               ON m.client_id = d.client_id
              AND m.destination_id = d.id
              AND m.canonical_event_name = $3
              AND m.is_active = TRUE
             LEFT JOIN social_connections sc
               ON sc.client_id = d.client_id
              AND sc.id = d.social_connection_id
               AND sc.status = 'active'
               AND sc.platform = CASE
                 WHEN d.platform = 'meta' THEN 'meta'
                 WHEN d.platform = 'google_data_manager' THEN 'google'
                 ELSE NULL
               END
             ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
             LEFT JOIN tracking_sites ts
               ON ts.client_id = d.client_id
              AND ts.id = p.tracking_site_id
              AND ts.is_active = TRUE
             LEFT JOIN LATERAL (
               SELECT ARRAY_AGG(c.mode ORDER BY c.mode) AS capability_modes
                 FROM conversion_destination_capabilities c
                WHERE c.client_id = d.client_id
                  AND c.destination_id = d.id
                  AND c.management_origin = 'zero'
                  AND c.can_zero_mutate = TRUE
                  AND c.status IN ('configured', 'validating', 'ready', 'degraded')
             ) caps ON TRUE
            WHERE d.client_id = $1
              AND d.id = $2
            FOR UPDATE OF d`,
          [input.clientId, input.destinationId, input.canonicalEventName]
        )
        const row = contextResult.rows?.[0] as ProviderContextRow | undefined
        if (!row) return { status: 'not_found' }
        if (Number(row.profile_config_version) !== input.expectedConfigVersion) {
          return { status: 'version_conflict' }
        }
        if (
          row.profile_enabled
          || row.profile_environment !== 'test'
          || row.destination_enabled
          || row.destination_environment !== 'test'
        ) return { status: 'not_test_mode' }
        if (row.platform !== expectedPlatform(input.mode)) return { status: 'not_found' }
        if (!row.provider_event_name) return { status: 'mapping_not_found' }
        if (row.platform !== 'tiktok' && !row.account_id) return { status: 'connection_not_found' }
        const capabilityModes = Array.isArray(row.capability_modes)
          ? row.capability_modes.filter((mode): mode is string => typeof mode === 'string')
          : []
        let metaDeliveryMode: 'crm' | 'web' = 'crm'
        if (input.mode === 'meta_test_events') {
          const requestedCapabilityConfigured = input.deliveryMode === 'web'
            ? capabilityModes.includes('meta_web_capi')
            : capabilityModes.includes('meta_crm_capi')
              || capabilityModes.includes('meta_conversion_leads')
          if (!requestedCapabilityConfigured) return { status: 'capability_not_configured' }
          metaDeliveryMode = classifyMeasurementEventIdentity(
            input.canonicalEventName,
            capabilityModes
          ).mode === 'browser_server_dedup'
            ? 'web'
            : 'crm'
          if (input.deliveryMode !== metaDeliveryMode) return { status: 'delivery_mode_mismatch' }
          if (input.deliveryMode === 'web') {
            const approvedOrigins = Array.isArray(row.allowed_origins)
              ? row.allowed_origins.map(normalizedOrigin).filter((origin): origin is string => Boolean(origin))
              : []
            const eventSourceOrigin = normalizedOrigin(input.eventSourceUrl)
            if (!eventSourceOrigin || !approvedOrigins.includes(eventSourceOrigin)) {
              return { status: 'source_origin_not_approved' }
            }
          }
        } else if (input.mode === 'tiktok_test_events') {
          if (!capabilityModes.includes('tiktok_events_api')) {
            return { status: 'capability_not_configured' }
          }
          const approvedOrigins = Array.isArray(row.allowed_origins)
            ? row.allowed_origins.map(normalizedOrigin).filter((origin): origin is string => Boolean(origin))
            : []
          const eventSourceOrigin = normalizedOrigin(input.eventSourceUrl)
          if (!eventSourceOrigin || !approvedOrigins.includes(eventSourceOrigin)) {
            return { status: 'source_origin_not_approved' }
          }
        }

        const insertedResult = await db.query(
          `INSERT INTO measurement_provider_test_runs (
             client_id, profile_id, destination_id, platform, mode, status,
             canonical_event_name, provider_event_name, config_version,
             idempotency_key, actor_id, reason
           ) VALUES ($1, $2, $3, $4, $5, 'requested', $6, $7, $8, $9, $10, $11)
           ON CONFLICT (client_id, idempotency_key) DO NOTHING
           RETURNING id, mode, status, provider_request_id, error_class, redacted_error, completed_at`,
          [
            input.clientId,
            row.profile_id,
            input.destinationId,
            row.platform,
            input.mode,
            input.canonicalEventName,
            row.provider_event_name,
            input.expectedConfigVersion,
            input.idempotencyKey,
            input.actor.id,
            input.reason
          ]
        )
        const inserted = insertedResult.rows?.[0] as TestRunRow | undefined
        if (!inserted) {
          const racedResult = await db.query(
            `SELECT id, mode, status, provider_request_id, error_class, redacted_error, completed_at
               FROM measurement_provider_test_runs
              WHERE client_id = $1
                AND idempotency_key = $2`,
            [input.clientId, input.idempotencyKey]
          )
          const raced = racedResult.rows?.[0] as TestRunRow | undefined
          if (!raced) throw new Error('Provider test reservation was not persisted')
          return { status: 'existing', run: runSummary(raced) }
        }

        const metadata = record(row.metadata)
        const operatingAccountId = row.account_id?.replaceAll('-', '') ?? ''
        const loginAccountId = (
          stringValue(metadata.google_login_customer_id)
          ?? stringValue(metadata.login_customer_id)
          ?? operatingAccountId
        ).replaceAll('-', '')
        const scopes = Array.isArray(row.scopes)
          ? row.scopes.filter((scope): scope is string => typeof scope === 'string')
          : []
        const googleRefreshToken = input.mode === 'google_validate_only'
          ? await resolveRefreshToken(row)
          : null

        return {
          status: 'reserved',
          context: {
            run: runSummary(inserted),
            delivery: {
              eventId: inserted.id,
              eventName: input.canonicalEventName,
              providerEventName: row.provider_event_name,
              occurredAt: input.occurredAt,
              idempotencyKey: input.idempotencyKey,
              externalDestinationId: row.external_destination_id,
              operatingAccountId,
              loginAccountId,
              metaDeliveryMode
            },
            credential: {
              credentialRef: row.credential_ref,
              refreshToken: input.mode === 'google_validate_only'
                ? googleRefreshToken
                : row.refresh_token,
              scopes
            }
          }
        }
      })
    },

    async complete(input) {
      await transaction(async (db) => {
        const result = await db.query(
          `UPDATE measurement_provider_test_runs
              SET status = $3,
                  provider_request_id = $4,
                  error_class = $5,
                  redacted_error = $6,
                  completed_at = $7::timestamptz
            WHERE client_id = $1
              AND id = $2
              AND status = 'requested'`,
          [
            input.clientId,
            input.runId,
            input.status,
            input.providerRequestId,
            input.errorClass,
            input.redactedError,
            input.completedAt
          ]
        )
        if (result.rowCount !== 1) throw new Error('Provider test evidence was not completed')
      })
    }
  }
}
