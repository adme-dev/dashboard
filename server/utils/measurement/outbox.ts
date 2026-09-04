import {
  AppendCanonicalConversionEventSchema,
  CanonicalConversionOutboxEventSchema
} from '~~/server/utils/measurement/contracts'
import type {
  AppendCanonicalConversionEvent,
  CanonicalConversionOutboxEvent
} from '~~/server/utils/measurement/contracts'

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

interface MeasurementProfileRow {
  id: string
  client_id: string
  enabled: boolean
  environment: 'test' | 'live' | 'paused'
  consent_mode: 'off' | 'au_optout' | 'consent_gated'
  config_version: number | string
  cache_status: 'not_published' | 'fresh' | 'stale' | 'error'
  cache_version: number | string | null
}

interface ConversionEventRow {
  id: string
  client_id: string
  profile_id: string
  event_name: string
  source_system: string
  source_entity_type: string
  source_entity_id: string
  source_event_id: string
  occurred_at: Date | string
  idempotency_key: string
  config_version: number | string
  consent_mode: string
  consent_decision: 'granted' | 'denied' | 'unknown'
  attribution: unknown
  outbox_status: string
  last_error_class: string | null
}

export type AppendCanonicalConversionEventResult
  = { status: 'created' | 'duplicate', event: CanonicalConversionOutboxEvent, deliveryCount: number }
    | { status: 'profile_not_found' }

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapEvent(row: ConversionEventRow): CanonicalConversionOutboxEvent {
  return CanonicalConversionOutboxEventSchema.parse({
    eventId: row.id,
    clientId: row.client_id,
    profileId: row.profile_id,
    eventName: row.event_name,
    sourceSystem: row.source_system,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    sourceEventId: row.source_event_id,
    occurredAt: iso(row.occurred_at),
    idempotencyKey: row.idempotency_key,
    configVersion: Number(row.config_version),
    consentMode: row.consent_mode,
    attribution: row.attribution,
    outboxStatus: row.outbox_status,
    policyReason: row.last_error_class
  })
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function buildCanonicalEventIdempotencyKey(
  rawInput: AppendCanonicalConversionEvent
): Promise<string> {
  const input = AppendCanonicalConversionEventSchema.parse(rawInput)
  const identity = JSON.stringify([
    input.clientId,
    input.sourceSystem,
    input.sourceEntityType,
    input.sourceEntityId,
    input.sourceEventId,
    input.eventName
  ])
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity)
  )
  return `v1:${bytesToHex(digest)}`
}

function deliveryPolicy(
  profile: MeasurementProfileRow,
  consentDecision: AppendCanonicalConversionEvent['consentDecision']
): { status: 'pending' | 'paused' | 'policy_skipped', reason: string | null } {
  if (!profile.enabled) return { status: 'paused', reason: 'profile_disabled' }
  if (profile.environment !== 'live') return { status: 'paused', reason: 'profile_not_live' }
  if (
    profile.cache_status !== 'fresh'
    || Number(profile.cache_version) !== Number(profile.config_version)
  ) {
    return { status: 'paused', reason: 'configuration_cache_not_current' }
  }
  if (profile.consent_mode === 'consent_gated' && consentDecision !== 'granted') {
    return { status: 'policy_skipped', reason: 'consent_not_granted' }
  }
  if (profile.consent_mode === 'au_optout' && consentDecision === 'denied') {
    return { status: 'policy_skipped', reason: 'consent_opted_out' }
  }
  return { status: 'pending', reason: null }
}

const EVENT_COLUMNS = `
  id, client_id, profile_id, event_name, source_system, source_entity_type,
  source_entity_id, source_event_id, occurred_at, idempotency_key,
  config_version, consent_mode, consent_decision, attribution, outbox_status, last_error_class
`

/**
 * Appends a canonical conversion event using the caller's database transaction.
 * The lifecycle mutation and this append must share the same TransactionClient.
 * Provider I/O and queue publication deliberately happen only after commit.
 */
export async function appendCanonicalConversionEvent(
  db: TransactionClient,
  rawInput: AppendCanonicalConversionEvent
): Promise<AppendCanonicalConversionEventResult> {
  const input = AppendCanonicalConversionEventSchema.parse(rawInput)
  const idempotencyKey = await buildCanonicalEventIdempotencyKey(input)

  const profileResult = await db.query(
    `SELECT id, client_id, enabled, environment, consent_mode, config_version,
            cache_status, cache_version
       FROM client_measurement_profiles
      WHERE client_id = $1
      FOR SHARE`,
    [input.clientId]
  )
  const profile = profileResult.rows?.[0] as MeasurementProfileRow | undefined
  if (!profile) return { status: 'profile_not_found' }

  const policy = deliveryPolicy(profile, input.consentDecision)
  let destinationIds: string[] = []
  if (policy.status === 'pending') {
    const destinationResult = await db.query(
      `SELECT d.id
         FROM conversion_destinations d
         JOIN conversion_event_mappings m
           ON m.client_id = d.client_id
          AND m.destination_id = d.id
          AND m.canonical_event_name = $3
          AND m.is_active = TRUE
        WHERE d.client_id = $1
          AND d.profile_id = $2
          AND d.enabled = TRUE
          AND d.environment = 'live'
          AND d.health_status IN ('ready', 'degraded')
        ORDER BY d.id`,
      [input.clientId, profile.id, input.eventName]
    )
    destinationIds = (destinationResult.rows ?? [])
      .map(row => (row as { id: string }).id)
    if (destinationIds.length === 0) {
      policy.status = 'paused'
      policy.reason = 'no_active_destination_mapping'
    }
  }

  const insertedResult = await db.query(
    `INSERT INTO conversion_events (
       client_id, profile_id, event_name, source_system, source_entity_type,
       source_entity_id, source_event_id, occurred_at, idempotency_key,
       config_version, consent_mode, consent_decision, attribution, outbox_status, last_error_class
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15
     )
     ON CONFLICT DO NOTHING
     RETURNING ${EVENT_COLUMNS}`,
    [
      input.clientId,
      profile.id,
      input.eventName,
      input.sourceSystem,
      input.sourceEntityType,
      input.sourceEntityId,
      input.sourceEventId,
      input.occurredAt,
      idempotencyKey,
      Number(profile.config_version),
      profile.consent_mode,
      input.consentDecision,
      JSON.stringify(input.attribution),
      policy.status,
      policy.reason
    ]
  )
  let eventRow = insertedResult.rows?.[0] as ConversionEventRow | undefined
  if (!eventRow) {
    const existingResult = await db.query(
      `SELECT ${EVENT_COLUMNS}
         FROM conversion_events
        WHERE client_id = $1
          AND (idempotency_key = $2 OR (source_system = $3 AND source_event_id = $4))
        LIMIT 1`,
      [input.clientId, idempotencyKey, input.sourceSystem, input.sourceEventId]
    )
    eventRow = existingResult.rows?.[0] as ConversionEventRow | undefined
    if (!eventRow) throw new Error('Canonical event conflict could not be resolved')
    if (
      eventRow.event_name !== input.eventName
      || eventRow.source_entity_type !== input.sourceEntityType
      || eventRow.source_entity_id !== input.sourceEntityId
    ) {
      throw new Error('Canonical event source identity conflict')
    }
    const countResult = await db.query(
      `SELECT COUNT(*) AS count
         FROM conversion_deliveries
        WHERE client_id = $1
          AND event_id = $2`,
      [input.clientId, eventRow.id]
    )
    const deliveryCount = Number((countResult.rows?.[0] as { count?: number | string } | undefined)?.count ?? 0)
    return { status: 'duplicate', event: mapEvent(eventRow), deliveryCount }
  }

  if (policy.status === 'pending') {
    await db.query(
      `INSERT INTO conversion_deliveries (
         client_id, event_id, destination_id, status, config_version, next_attempt_at
       )
       SELECT $1, $2, destination_id, 'pending', $3, NOW()
         FROM UNNEST($4::uuid[]) AS destination_id
       ON CONFLICT (event_id, destination_id) DO NOTHING`,
      [input.clientId, eventRow.id, Number(profile.config_version), destinationIds]
    )
  }

  return {
    status: 'created',
    event: mapEvent(eventRow),
    deliveryCount: policy.status === 'pending' ? destinationIds.length : 0
  }
}
