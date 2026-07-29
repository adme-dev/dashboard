export const EMAIL_INGESTION_EVENT_NAMES = [
  'email_ingestion_receipt',
  'email_ingestion_policy',
  'email_ingestion_stage_reservation',
  'email_ingestion_r2_write',
  'email_ingestion_r2_delete',
  'email_ingestion_parse',
  'email_ingestion_ai',
  'email_ingestion_canonical',
  'email_ingestion_transport_duplicate',
  'email_ingestion_possible_duplicate',
  'email_ingestion_recovery_claim',
  'email_ingestion_recovery_outcome',
  'email_ingestion_quarantine',
  'email_ingestion_replay',
  'email_ingestion_failure'
] as const

export type EmailIngestionEventName = typeof EMAIL_INGESTION_EVENT_NAMES[number]

const EVENT_NAMES = new Set<string>(EMAIL_INGESTION_EVENT_NAMES)
const PROVIDERS = new Set([
  'adf', 'autotrader', 'carsales', 'carsguide', 'drive', 'generic',
  'google', 'gumtree', 'instagram', 'meta', 'tiktok'
])
const PARSERS = new Set(['adf', 'provider', 'generic', 'ai_fallback', 'none'])
const STATUSES = new Set([
  'received', 'allowed', 'denied', 'reserved', 'written', 'deleted',
  'parsed', 'accepted', 'duplicate', 'possible_duplicate', 'quarantined',
  'failed', 'claimed', 'rescheduled', 'replayed', 'in_progress', 'rejected',
  'retryable_error', 'error'
])
const ERROR_CLASSES = new Set([
  'none', 'unexpected', 'policy_denied', 'unknown_recipient',
  'signature_invalid', 'r2_write_failed', 'r2_delete_failed',
  'parse_failed', 'ai_schema_rejected', 'canonical_failed',
  'evidence_expired', 'attempts_exhausted', 'missing_evidence',
  'corrupt_evidence', 'endpoint_unavailable', 'sender_policy_denied',
  'canonical_transient', 'canonical_window_elapsed', 'lease_lost',
  'legacy_evidence', 'legacy_unbound_evidence', 'content_mismatch',
  'identity_mismatch', 'email_health_endpoint_failed',
  'email_health_query_failed', 'email_health_global_failed',
  'email_health_state_failed', 'email_health_scan_failed'
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface EmailIngestionTelemetryInput {
  event: EmailIngestionEventName
  correlationId?: string | null
  endpointId?: string | null
  clientId?: string | null
  provider?: string | null
  parser?: string | null
  status?: string | null
  durationMs?: number | null
  errorClass?: string | null
  attemptCount?: number | null
}

function boundedEnum(value: string | null | undefined, allowed: Set<string>): string | undefined {
  if (!value) return undefined
  return allowed.has(value) ? value : 'unknown'
}

function boundedInteger(value: number | null | undefined): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Math.min(Number(value), 86_400_000)
    : undefined
}

/**
 * Content fields are excluded by construction. Invalid identifiers and
 * unregistered dimensions are omitted or collapsed to a bounded enum.
 * Telemetry is deliberately best-effort and can never fail ingestion.
 */
export function emitEmailIngestionEvent(
  input: EmailIngestionTelemetryInput,
  write: (event: Record<string, unknown>) => void = event => console.log(JSON.stringify(event))
): void {
  try {
    if (!EVENT_NAMES.has(input.event)) return
    const event: Record<string, unknown> = { event: input.event }
    if (input.correlationId && UUID.test(input.correlationId)) event.correlationId = input.correlationId
    if (input.endpointId && UUID.test(input.endpointId)) event.endpointId = input.endpointId
    if (input.clientId && UUID.test(input.clientId)) event.clientId = input.clientId
    const provider = boundedEnum(input.provider, PROVIDERS)
    const parser = boundedEnum(input.parser, PARSERS)
    const status = boundedEnum(input.status, STATUSES)
    const errorClass = input.errorClass
      ? (ERROR_CLASSES.has(input.errorClass) ? input.errorClass : 'unexpected')
      : undefined
    if (provider) event.provider = provider
    if (parser) event.parser = parser
    if (status) event.status = status
    if (errorClass) event.errorClass = errorClass
    const durationMs = boundedInteger(input.durationMs)
    const attemptCount = boundedInteger(input.attemptCount)
    if (durationMs !== undefined) event.durationMs = durationMs
    if (attemptCount !== undefined) event.attemptCount = Math.min(attemptCount, 100)
    write(event)
  } catch {
    // Logging must remain non-fatal.
  }
}
