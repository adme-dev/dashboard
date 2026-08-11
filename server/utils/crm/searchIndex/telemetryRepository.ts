import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MODES,
  CRM_SEARCH_SURFACES
} from './contracts'
import {
  CRM_SEARCH_EVENT_TYPES,
  CRM_SEARCH_QUERY_LENGTH_BUCKETS,
  CRM_SEARCH_RANK_EVIDENCE_MAX_BYTES,
  CRM_SEARCH_RANK_REASON_CLASSES,
  CRM_SEARCH_THRESHOLD_REVISIONS,
  type CrmSearchRankEvidence,
  type CrmSearchTelemetryEvent
} from './telemetry'
import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireBoolean,
  requireDate,
  requireEnum,
  requireHmacDigest,
  requireSafeInteger,
  requireString,
  requireUuid,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const unsafeCode = 'crm_search_telemetry_unsafe'
const aggregateCode = 'crm_search_telemetry_invalid_aggregate'
const actorTypes = ['staff', 'portal', 'system'] as const
const fallbackClasses = [
  'none', 'mode_off', 'privacy_guard', 'budget_exhausted', 'deadline',
  'provider_unavailable', 'policy_changed', 'authorization_changed',
  'ledger_failure', 'join_back_failure', 'validation_failure'
] as const
const statusClasses = [
  'keyword_only', 'shadow_completed', 'assist_completed', 'fallback', 'security_rejection'
] as const
const eventKeys = new Set([
  'organisationScopeId', 'clientId', 'correlationId', 'eventType', 'actorType',
  'mode', 'surface', 'sampled', 'queryDigest', 'queryDigestKeyVersion',
  'queryLengthBucket', 'keywordResultCount', 'semanticCandidateCount',
  'fusedResultCount', 'rankEvidence', 'keywordLatencyMs', 'embeddingLatencyMs',
  'vectorLatencyMs', 'joinBackLatencyMs', 'totalLatencyMs', 'fallbackClass', 'statusClass'
])
const rankKeys = new Set([
  'keywordRanks', 'semanticRanks', 'fusedRanks', 'overlapCount', 'orderingChanged',
  'abstained', 'thresholdRevision', 'resultCount', 'reasonClass'
])
const rankEntryKeys = new Set(['entityType', 'entityIdDigest', 'rank', 'scoreBucket'])
const encoder = new TextEncoder()

export interface CrmSearchDailyTelemetryIncrement {
  eventDate: string
  eligibleCount: number
  sampledCount: number
  requestCount: number
  fallbackCount: number
  timeoutCount: number
  lateBilledCompletionCount: number
  latencyCount: number
  latencySumMs: number
  latencyMaxMs: number
}

export interface PersistCrmSearchTelemetryInput {
  event: CrmSearchTelemetryEvent
  aggregate: CrmSearchDailyTelemetryIncrement | null
}

export interface TelemetryRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

function requireLatency(value: unknown): number | undefined {
  if (value === undefined) return undefined
  return requireSafeInteger(value, unsafeCode, { maximum: 2_147_483_647 })
}

/** PostgreSQL JSONB text adds one space after each structural comma and colon. */
function conservativeJsonbTextBytes(value: unknown): number {
  const compact = JSON.stringify(value)
  let structuralSeparators = 0
  let insideString = false
  let escaped = false
  for (const character of compact) {
    if (escaped) {
      escaped = false
      continue
    }
    if (insideString && character === '\\') {
      escaped = true
      continue
    }
    if (character === '"') {
      insideString = !insideString
      continue
    }
    if (!insideString && (character === ',' || character === ':')) structuralSeparators += 1
  }
  return encoder.encode(compact).byteLength + structuralSeparators
}

function validateRankEvidence(value: unknown): CrmSearchRankEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw crmSearchRepositoryError(unsafeCode)
  }
  const rank = value as Record<string, unknown>
  if (Object.keys(rank).some(key => !rankKeys.has(key))) {
    throw crmSearchRepositoryError(unsafeCode)
  }
  for (const key of ['keywordRanks', 'semanticRanks', 'fusedRanks'] as const) {
    const entries = rank[key]
    if (entries === undefined) continue
    if (!Array.isArray(entries) || entries.length > 50) throw crmSearchRepositoryError(unsafeCode)
    for (const entryValue of entries) {
      if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) {
        throw crmSearchRepositoryError(unsafeCode)
      }
      const entry = entryValue as Record<string, unknown>
      if (Object.keys(entry).some(entryKey => !rankEntryKeys.has(entryKey))) {
        throw crmSearchRepositoryError(unsafeCode)
      }
      requireEnum(entry.entityType, CRM_SEARCH_ENTITY_TYPES, unsafeCode)
      requireHmacDigest(entry.entityIdDigest, unsafeCode)
      requireSafeInteger(entry.rank, unsafeCode, { minimum: 1, maximum: 50 })
      if (entry.scoreBucket !== undefined) {
        requireSafeInteger(entry.scoreBucket, unsafeCode, { maximum: 100 })
      }
    }
  }
  for (const key of ['overlapCount', 'resultCount'] as const) {
    if (rank[key] !== undefined) requireSafeInteger(rank[key], unsafeCode, { maximum: 50 })
  }
  for (const key of ['orderingChanged', 'abstained'] as const) {
    if (rank[key] !== undefined) requireBoolean(rank[key], unsafeCode)
  }
  if (rank.thresholdRevision !== undefined) {
    requireEnum(rank.thresholdRevision, CRM_SEARCH_THRESHOLD_REVISIONS, unsafeCode)
  }
  if (rank.reasonClass !== undefined) {
    requireEnum(rank.reasonClass, CRM_SEARCH_RANK_REASON_CLASSES, unsafeCode)
  }
  if (conservativeJsonbTextBytes(rank) > CRM_SEARCH_RANK_EVIDENCE_MAX_BYTES) {
    throw crmSearchRepositoryError(unsafeCode)
  }
  return value as CrmSearchRankEvidence
}

function validateEvent(event: CrmSearchTelemetryEvent): CrmSearchTelemetryEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || Object.keys(event).some(key => !eventKeys.has(key))) {
    throw crmSearchRepositoryError(unsafeCode)
  }
  requireUuid(event.organisationScopeId, unsafeCode)
  requireUuid(event.clientId, unsafeCode)
  requireUuid(event.correlationId, unsafeCode)
  requireEnum(event.eventType, CRM_SEARCH_EVENT_TYPES, unsafeCode)
  requireEnum(event.actorType, actorTypes, unsafeCode)
  requireEnum(event.mode, CRM_SEARCH_MODES, unsafeCode)
  requireEnum(event.surface, CRM_SEARCH_SURFACES, unsafeCode)
  requireBoolean(event.sampled, unsafeCode)
  requireHmacDigest(event.queryDigest, unsafeCode)
  requireString(event.queryDigestKeyVersion, unsafeCode, {
    maximumLength: 80,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
  })
  requireEnum(event.queryLengthBucket, CRM_SEARCH_QUERY_LENGTH_BUCKETS, unsafeCode)
  requireSafeInteger(event.keywordResultCount, unsafeCode, { maximum: 50 })
  requireSafeInteger(event.semanticCandidateCount, unsafeCode, { maximum: 50 })
  requireSafeInteger(event.fusedResultCount, unsafeCode, { maximum: 50 })
  validateRankEvidence(event.rankEvidence)
  requireLatency(event.keywordLatencyMs)
  requireLatency(event.embeddingLatencyMs)
  requireLatency(event.vectorLatencyMs)
  requireLatency(event.joinBackLatencyMs)
  requireLatency(event.totalLatencyMs)
  requireEnum(event.fallbackClass, fallbackClasses, unsafeCode)
  requireEnum(event.statusClass, statusClasses, unsafeCode)
  return event
}

function validateAggregate(
  value: CrmSearchDailyTelemetryIncrement | null
): CrmSearchDailyTelemetryIncrement | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw crmSearchRepositoryError(aggregateCode)
  }
  const allowed = new Set([
    'eventDate', 'eligibleCount', 'sampledCount', 'requestCount', 'fallbackCount',
    'timeoutCount', 'lateBilledCompletionCount', 'latencyCount', 'latencySumMs', 'latencyMaxMs'
  ])
  if (Object.keys(value).length !== allowed.size
    || Object.keys(value).some(key => !allowed.has(key))) {
    throw crmSearchRepositoryError(aggregateCode)
  }
  requireDate(value.eventDate, aggregateCode)
  const maximum = 1_000_000_000
  for (const key of [
    'eligibleCount', 'sampledCount', 'requestCount', 'fallbackCount', 'timeoutCount',
    'lateBilledCompletionCount', 'latencyCount', 'latencySumMs', 'latencyMaxMs'
  ] as const) requireSafeInteger(value[key], aggregateCode, { maximum })
  const consistent = value.sampledCount <= value.eligibleCount
    && value.fallbackCount <= value.requestCount
    && value.timeoutCount <= value.requestCount
    && value.latencyCount <= value.requestCount
    && ((value.latencyCount === 0 && value.latencySumMs === 0 && value.latencyMaxMs === 0)
      || (value.latencyCount > 0 && value.latencyMaxMs <= value.latencySumMs))
  if (!consistent) throw crmSearchRepositoryError(aggregateCode)
  return value
}

export async function persistCrmSearchTelemetry(
  input: PersistCrmSearchTelemetryInput,
  dependencies: TelemetryRepositoryDependencies = {}
): Promise<{ eventId: string, aggregateId: string | null }> {
  const event = validateEvent(input.event)
  const aggregate = validateAggregate(input.aggregate)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    const eventRow = firstRow(await transaction.query(`
      INSERT INTO crm_search_events (
        organisation_scope_id, client_id, correlation_id, event_type, actor_type,
        mode, surface, sampled, query_digest, query_digest_key_version,
        query_length_bucket, keyword_result_count, semantic_candidate_count,
        fused_result_count, rank_evidence, keyword_latency_ms, embedding_latency_ms,
        vector_latency_ms, join_back_latency_ms, total_latency_ms, fallback_class, status_class
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15::JSONB, $16, $17, $18, $19, $20, $21, $22
      )
      RETURNING id
    `, [event.organisationScopeId, event.clientId, event.correlationId, event.eventType,
      event.actorType, event.mode, event.surface, event.sampled, event.queryDigest,
      event.queryDigestKeyVersion, event.queryLengthBucket, event.keywordResultCount,
      event.semanticCandidateCount, event.fusedResultCount, JSON.stringify(event.rankEvidence),
      event.keywordLatencyMs ?? null, event.embeddingLatencyMs ?? null,
      event.vectorLatencyMs ?? null, event.joinBackLatencyMs ?? null,
      event.totalLatencyMs ?? null, event.fallbackClass, event.statusClass]))
    const eventId = requireUuid(eventRow?.id, unsafeCode)
    if (!aggregate) return { eventId, aggregateId: null }

    const aggregateRow = firstRow(await transaction.query(`
      INSERT INTO crm_search_daily_events (
        event_date, organisation_scope_id, client_id, mode, surface, status_class,
        eligible_count, sampled_count, request_count, fallback_count, timeout_count,
        late_billed_completion_count, latency_count, latency_sum_ms, latency_max_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (event_date, organisation_scope_id, client_id, mode, surface, status_class)
      DO UPDATE SET
        eligible_count = crm_search_daily_events.eligible_count + EXCLUDED.eligible_count,
        sampled_count = crm_search_daily_events.sampled_count + EXCLUDED.sampled_count,
        request_count = crm_search_daily_events.request_count + EXCLUDED.request_count,
        fallback_count = crm_search_daily_events.fallback_count + EXCLUDED.fallback_count,
        timeout_count = crm_search_daily_events.timeout_count + EXCLUDED.timeout_count,
        late_billed_completion_count = crm_search_daily_events.late_billed_completion_count
          + EXCLUDED.late_billed_completion_count,
        latency_count = crm_search_daily_events.latency_count + EXCLUDED.latency_count,
        latency_sum_ms = crm_search_daily_events.latency_sum_ms + EXCLUDED.latency_sum_ms,
        latency_max_ms = GREATEST(crm_search_daily_events.latency_max_ms, EXCLUDED.latency_max_ms)
      RETURNING id
    `, [aggregate.eventDate, event.organisationScopeId, event.clientId, event.mode,
      event.surface, event.statusClass, aggregate.eligibleCount, aggregate.sampledCount,
      aggregate.requestCount, aggregate.fallbackCount, aggregate.timeoutCount,
      aggregate.lateBilledCompletionCount, aggregate.latencyCount,
      aggregate.latencySumMs, aggregate.latencyMaxMs]))
    return { eventId, aggregateId: requireUuid(aggregateRow?.id, aggregateCode) }
  })
}
