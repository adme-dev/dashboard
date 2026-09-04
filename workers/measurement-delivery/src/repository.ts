import type {
  MeasurementDeliveryClaim,
  MeasurementDeliveryMessage,
  RecordedDeliveryResult
} from './delivery'

interface QueryResult {
  rows?: unknown[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}

interface RepositoryDeps {
  transaction: <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>
}

interface DeliveryRow {
  delivery_id: string
  destination_id: string
  attempt_count: number | string
  platform: 'meta' | 'google_data_manager' | 'tiktok'
  profile_enabled: boolean
  profile_environment: 'test' | 'live' | 'paused'
  profile_cache_status: string
  profile_cache_version: number | string | null
  profile_config_version: number | string
  destination_enabled: boolean
  destination_environment: 'test' | 'live' | 'paused'
  destination_health_status: MeasurementDeliveryClaim['destinationHealthStatus']
  event_config_version: number | string
  event_id: string
  event_name: string
  provider_event_name: string | null
  occurred_at: Date | string
  idempotency_key: string
  external_destination_id: string
  credential_ref: string | null
  account_id: string | null
  refresh_token: string | null
  scopes: unknown
  metadata: unknown
  attribution: unknown
  capability_modes: unknown
  tracking_fbc: string | null
  tracking_fbp: string | null
  tracking_page_url: string | null
  tracking_ua: string | null
  tracking_gclid: string | null
  tracking_gbraid: string | null
  tracking_wbraid: string | null
  tracking_ttclid: string | null
  tracking_ttp: string | null
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function optionalString(value: unknown, max = 512): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null
}

function validMetaLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  return /^\d{15,16}$/.test(candidate) ? candidate : null
}

function safeEventSourceUrl(value: unknown): string | null {
  const candidate = optionalString(value, 2048)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return `${url.origin}${url.pathname}`.slice(0, 2048)
  } catch {
    return null
  }
}

function mapClaim(
  clientId: string,
  row: DeliveryRow,
  attemptNumber: number
): MeasurementDeliveryClaim {
  const attribution = record(row.attribution)
  const metadata = record(row.metadata)
  const accountId = row.account_id?.replace(/-/g, '') ?? ''
  const loginAccountId = optionalString(metadata.google_login_customer_id)
    ?? optionalString(metadata.login_customer_id)
    ?? accountId
  const scopes = Array.isArray(row.scopes)
    ? row.scopes.filter((scope): scope is string => typeof scope === 'string')
    : []
  const capabilityModes = Array.isArray(row.capability_modes)
    ? row.capability_modes.filter((mode): mode is string => typeof mode === 'string')
    : []
  const browserEventId = optionalString(attribution.browserEventId, 128)
  const metaLeadId = validMetaLeadId(attribution.metaLeadId)
  const metaDeliveryMode = row.platform === 'meta'
    && Boolean(browserEventId)
    && capabilityModes.includes('meta_web_capi')
    && !metaLeadId
    ? 'web'
    : 'crm'

  return {
    clientId,
    deliveryId: row.delivery_id,
    destinationId: row.destination_id,
    attemptNumber,
    platform: row.platform,
    profileEnabled: row.profile_enabled,
    profileEnvironment: row.profile_environment,
    profileCacheCurrent: row.profile_cache_status === 'fresh'
      && Number(row.profile_cache_version) === Number(row.profile_config_version),
    destinationEnabled: row.destination_enabled,
    destinationEnvironment: row.destination_environment,
    destinationHealthStatus: row.destination_health_status,
    deliveryConfigCurrent: Number(row.event_config_version) === Number(row.profile_config_version)
      && Boolean(row.provider_event_name),
    eventId: row.event_id,
    eventName: row.event_name,
    providerEventName: row.provider_event_name ?? '',
    occurredAt: iso(row.occurred_at),
    idempotencyKey: row.idempotency_key,
    externalDestinationId: row.external_destination_id,
    operatingAccountId: accountId,
    loginAccountId: loginAccountId.replace(/-/g, ''),
    metaDeliveryMode,
    credentialRef: row.credential_ref,
    refreshToken: row.refresh_token,
    connectionScopes: scopes,
    attribution: {
      browserEventId,
      metaLeadId,
      gclid: optionalString(attribution.gclid) ?? optionalString(row.tracking_gclid),
      gbraid: optionalString(attribution.gbraid) ?? optionalString(row.tracking_gbraid),
      wbraid: optionalString(attribution.wbraid) ?? optionalString(row.tracking_wbraid),
      fbc: optionalString(attribution.fbc) ?? optionalString(row.tracking_fbc),
      fbp: optionalString(attribution.fbp) ?? optionalString(row.tracking_fbp),
      ttclid: optionalString(attribution.ttclid) ?? optionalString(row.tracking_ttclid),
      ttp: optionalString(attribution.ttp) ?? optionalString(row.tracking_ttp),
      eventSourceUrl: safeEventSourceUrl(attribution.eventSourceUrl)
        ?? safeEventSourceUrl(row.tracking_page_url),
      clientUserAgent: optionalString(attribution.clientUserAgent, 1024)
        ?? optionalString(row.tracking_ua, 1024)
    }
  }
}

function retryAt(attemptNumber: number, now: Date): string | null {
  const seconds = Math.min(3600, 60 * (2 ** Math.max(0, attemptNumber - 1)))
  return new Date(now.getTime() + seconds * 1000).toISOString()
}

function deliveryStatus(outcome: RecordedDeliveryResult['outcome']) {
  if (outcome === 'permanent_failure') return 'permanent_failure'
  return outcome
}

export function createMeasurementDeliveryRepository(deps: RepositoryDeps) {
  return {
    async claimNext(
      message: MeasurementDeliveryMessage,
      workerId: string,
      now: Date
    ): Promise<MeasurementDeliveryClaim | null> {
      return deps.transaction(async (db) => {
        const selected = await db.query(
          `SELECT d.id AS delivery_id,
                  d.destination_id,
                  d.attempt_count,
                  dest.platform,
                  p.enabled AS profile_enabled,
                  p.environment AS profile_environment,
                  p.cache_status AS profile_cache_status,
                  p.cache_version AS profile_cache_version,
                  p.config_version AS profile_config_version,
                  dest.enabled AS destination_enabled,
                  dest.environment AS destination_environment,
                  dest.health_status AS destination_health_status,
                  e.config_version AS event_config_version,
                  e.id AS event_id,
                  e.event_name,
                  m.provider_event_name,
                  e.occurred_at,
                  e.idempotency_key,
                  e.attribution,
                  caps.capability_modes,
                  browser.fbc AS tracking_fbc,
                  browser.fbp AS tracking_fbp,
                  browser.page_url AS tracking_page_url,
                  browser.ua AS tracking_ua,
                  browser.gclid AS tracking_gclid,
                  browser.gbraid AS tracking_gbraid,
                  browser.wbraid AS tracking_wbraid,
                  browser.ttclid AS tracking_ttclid,
                  browser.ttp AS tracking_ttp,
                  dest.external_destination_id,
                  dest.credential_ref,
                  sc.account_id,
                  sc.refresh_token,
                  sc.scopes,
                  sc.metadata
             FROM conversion_deliveries d
             JOIN conversion_events e
               ON e.client_id = d.client_id
              AND e.id = d.event_id
             JOIN client_measurement_profiles p
               ON p.client_id = e.client_id
              AND p.id = e.profile_id
             JOIN conversion_destinations dest
               ON dest.client_id = d.client_id
              AND dest.id = d.destination_id
             LEFT JOIN conversion_event_mappings m
               ON m.client_id = d.client_id
              AND m.destination_id = d.destination_id
              AND m.canonical_event_name = e.event_name
              AND m.is_active = TRUE
             LEFT JOIN LATERAL (
               SELECT ARRAY_AGG(c.mode ORDER BY c.mode) AS capability_modes
                 FROM conversion_destination_capabilities c
                WHERE c.client_id = dest.client_id
                  AND c.destination_id = dest.id
                  AND c.status IN ('ready', 'degraded')
             ) caps ON TRUE
             LEFT JOIN LATERAL (
               SELECT te.fbc, te.fbp, te.page_url, te.ua,
                      te.gclid, te.gbraid, te.wbraid, te.ttclid, te.ttp
                 FROM tracking_events te
                WHERE te.client_id = e.client_id
                  AND te.event_id = e.attribution->>'browserEventId'
                ORDER BY te.occurred_at DESC, te.id DESC
                LIMIT 1
             ) browser ON TRUE
             LEFT JOIN social_connections sc
               ON sc.client_id = dest.client_id
              AND sc.id = dest.social_connection_id
              AND sc.status = 'active'
              AND sc.platform = CASE
                WHEN dest.platform = 'meta' THEN 'meta'
                WHEN dest.platform = 'google_data_manager' THEN 'google'
                ELSE NULL
              END
            WHERE d.client_id = $1
              AND d.event_id = $2
              AND (
                (
                  d.status IN ('pending', 'retryable')
                  AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= $3::timestamptz)
                )
                OR (
                  d.status = 'claimed'
                  AND d.claimed_at < $3::timestamptz - INTERVAL '5 minutes'
                )
              )
            ORDER BY d.created_at, d.id
            FOR UPDATE OF d SKIP LOCKED
            LIMIT 1`,
          [message.clientId, message.eventId, now.toISOString()]
        )
        const row = selected.rows?.[0] as DeliveryRow | undefined
        if (!row) return null

        const claimed = await db.query(
          `UPDATE conversion_deliveries
              SET status = 'claimed',
                  attempt_count = attempt_count + 1,
                  claimed_at = $3::timestamptz,
                  claimed_by = $2,
                  last_attempt_at = $3::timestamptz,
                  updated_at = $3::timestamptz
            WHERE id = $1
          RETURNING attempt_count`,
          [row.delivery_id, workerId, now.toISOString()]
        )
        const attemptNumber = Number(
          (claimed.rows?.[0] as { attempt_count?: number | string } | undefined)?.attempt_count
        )
        if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
          throw new Error('Measurement delivery attempt was not claimed')
        }
        return mapClaim(message.clientId, row, attemptNumber)
      })
    },

    async complete(
      claim: MeasurementDeliveryClaim,
      result: RecordedDeliveryResult,
      now: Date
    ): Promise<void> {
      await deps.transaction(async (db) => {
        const nextAttemptAt = result.outcome === 'retryable'
          ? retryAt(claim.attemptNumber, now)
          : null
        const pendingGoogleDiagnostics = claim.platform === 'google_data_manager'
          && result.outcome === 'accepted'
          && Boolean(result.providerRequestId)
        const diagnosticStatus = pendingGoogleDiagnostics ? 'pending' : 'not_required'
        const diagnosticNextCheckAt = pendingGoogleDiagnostics
          ? new Date(now.getTime() + 30 * 60 * 1000).toISOString()
          : null
        await db.query(
          `INSERT INTO conversion_delivery_attempts (
             client_id, delivery_id, attempt_number, outcome,
             provider_request_id, error_class, redacted_diagnostic, attempted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
          [
            claim.clientId,
            claim.deliveryId,
            claim.attemptNumber,
            result.outcome,
            result.providerRequestId,
            result.errorClass,
            result.redactedDiagnostic,
            now.toISOString()
          ]
        )
        await db.query(
          `UPDATE conversion_deliveries
              SET status = $2,
                  next_attempt_at = $3::timestamptz,
                  claimed_at = NULL,
                  claimed_by = NULL,
                  delivered_at = CASE WHEN $2 = 'delivered' THEN $4::timestamptz ELSE delivered_at END,
                  provider_request_id = $5,
                  error_class = $6,
                  redacted_error = $7,
                  diagnostic_status = $8,
                  diagnostic_started_at = CASE WHEN $8 = 'pending' THEN $4::timestamptz ELSE NULL END,
                  diagnostic_next_check_at = $9::timestamptz,
                  updated_at = $4::timestamptz
            WHERE id = $1
              AND status = 'claimed'`,
          [
            claim.deliveryId,
            deliveryStatus(result.outcome),
            nextAttemptAt,
            now.toISOString(),
            result.providerRequestId,
            result.errorClass,
            result.redactedDiagnostic,
            diagnosticStatus,
            diagnosticNextCheckAt
          ]
        )

        if (result.outcome !== 'policy_skipped') {
          const successful = result.outcome === 'accepted'
            && claim.platform !== 'google_data_manager'
          const failed = result.outcome === 'retryable' || result.outcome === 'permanent_failure'
          const blocked = result.outcome === 'permanent_failure'
            && [
              'meta_credential_missing',
              'google_credential_missing',
              'google_oauth_reconsent_required',
              'tiktok_events_api_credential_unavailable'
            ]
              .includes(result.errorClass ?? '')
          await db.query(
            `UPDATE conversion_destinations
                SET health_status = $2,
                    last_success_at = CASE WHEN $3 THEN $4::timestamptz ELSE last_success_at END,
                    last_failure_at = CASE WHEN $9 THEN $4::timestamptz ELSE last_failure_at END,
                    provider_request_id = $5,
                    error_class = $6,
                    redacted_error = $7,
                    updated_at = $4::timestamptz
              WHERE id = $1
                AND client_id = $8`,
            [
              claim.destinationId,
              pendingGoogleDiagnostics ? 'validating' : successful ? 'ready' : blocked ? 'blocked' : 'degraded',
              successful,
              now.toISOString(),
              result.providerRequestId,
              result.errorClass,
              result.redactedDiagnostic,
              claim.clientId,
              failed
            ]
          )
        }
      })
    }
  }
}
