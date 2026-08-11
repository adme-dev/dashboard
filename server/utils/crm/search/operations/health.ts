import type { CrmSearchGlobalState, CrmSearchSchemaRole } from '~~/server/utils/crm/searchIndex/contracts'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'

export const CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS = Object.freeze({
  warn: 6_000,
  page: 8_000,
  blockNewIndexing: 9_000
})

// Durable row ceilings are deliberately independent from provider-call and cost budgets.
export const CRM_SEARCH_DURABLE_TABLE_CAPACITIES = Object.freeze({
  dirty: 100_000,
  operations: 50_000
})

interface CapacityCounter { used: number, limit: number }
export interface CrmSearchCapacity { dirty: CapacityCounter, operations: CapacityCounter }

export function assertCrmSearchDurableCapacityAdmission(capacity: CrmSearchCapacity) {
  const health = evaluateCrmSearchCapacityHealth(capacity)
  if (health.blockNewIndexing) throw new Error('crm_search_dirty_operation_capacity_blocked')
  return health
}

export async function loadCrmSearchDurableCapacity(organisationScopeId: string): Promise<CrmSearchCapacity> {
  const row = await queryOneFresh<{ dirty: number, operations: number }>(`
    SELECT
      (SELECT COUNT(*)::INT FROM crm_search_source_dirty dirty
        WHERE dirty.organisation_scope_id = $1::UUID) AS dirty,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = $1::UUID) AS operations
  `, [organisationScopeId])
  if (!row || !Number.isSafeInteger(Number(row.dirty))
    || !Number.isSafeInteger(Number(row.operations))) {
    throw new Error('crm_search_dirty_operation_capacity_unavailable')
  }
  return Object.freeze({
    dirty: Object.freeze({
      used: Number(row.dirty), limit: CRM_SEARCH_DURABLE_TABLE_CAPACITIES.dirty
    }),
    operations: Object.freeze({
      used: Number(row.operations), limit: CRM_SEARCH_DURABLE_TABLE_CAPACITIES.operations
    })
  })
}

export interface CrmSearchHealthInput {
  global: { state: CrmSearchGlobalState, revision: number, maximumMode: 'off' | 'shadow' | 'assist', indexingReady: boolean }
  counts: { dirty: number, pending: number, providerPending: number, retryable: number, deadLetters: number }
  capacity: CrmSearchCapacity
  oldestAgeSeconds: { dirty: number | null, operation: number | null, queue: number | null }
  schema: Array<{ version: string, role: CrmSearchSchemaRole, confirmedVectors: number }>
  dependency: Array<{
    name: 'neon' | 'workers_ai' | 'vectorize' | 'queue'
    status: 'ok' | 'degraded' | 'down'
    evidence?: Readonly<Record<string, number | boolean | null>>
  }>
  freshness: { staleClients: number, sourceHighWatermarkLag: number, p95RevisionLag: number | null }
  cost: { globalBudgetUsedBasisPoints: number, clientsNearBudget: number, configuredGlobalBudgetUsdMicros: number }
  keyword: { requests: number, failures: number }
  fallbacks: Readonly<Record<string, number>>
  security: { crossScopeCandidateRejections: number }
}

const allowedKeys = new Set([
  'global', 'counts', 'capacity', 'oldestAgeSeconds', 'schema', 'dependency',
  'freshness', 'cost', 'keyword', 'fallbacks', 'security'
])

function invalid(): never {
  throw new Error('crm_search_invalid_health_input')
}

function nonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid()
  return value
}

function basisPoints(counter: CapacityCounter): number {
  const used = nonNegative(counter?.used)
  const limit = nonNegative(counter?.limit)
  if (limit < 1) invalid()
  return Math.floor((used * 10_000) / limit)
}

export function evaluateCrmSearchCapacityHealth(capacity: CrmSearchCapacity) {
  const usedBasisPoints = Math.max(basisPoints(capacity.dirty), basisPoints(capacity.operations))
  if (usedBasisPoints >= CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS.blockNewIndexing) {
    return Object.freeze({ level: 'blocked', blockNewIndexing: true, notify: 'page', usedBasisPoints })
  }
  if (usedBasisPoints >= CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS.page) {
    return Object.freeze({ level: 'page', blockNewIndexing: false, notify: 'page', usedBasisPoints })
  }
  if (usedBasisPoints >= CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS.warn) {
    return Object.freeze({ level: 'warning', blockNewIndexing: false, notify: 'warning', usedBasisPoints })
  }
  return Object.freeze({ level: 'ok', blockNewIndexing: false, notify: 'dashboard', usedBasisPoints })
}

function validateInput(value: unknown): CrmSearchHealthInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const input = value as CrmSearchHealthInput & Record<string, unknown>
  if (Object.keys(input).some(key => !allowedKeys.has(key))) invalid()
  if (!input.global || !input.counts || !input.capacity || !input.oldestAgeSeconds
    || !Array.isArray(input.schema) || !Array.isArray(input.dependency) || !input.freshness
    || !input.cost || !input.keyword || !input.fallbacks || !input.security) invalid()
  for (const value of Object.values(input.counts)) nonNegative(value)
  for (const value of Object.values(input.cost)) nonNegative(value)
  nonNegative(input.keyword.requests)
  nonNegative(input.keyword.failures)
  if (input.keyword.failures > input.keyword.requests) invalid()
  evaluateCrmSearchCapacityHealth(input.capacity)
  return input
}

export function buildCrmSearchHealthView(value: unknown) {
  const input = validateInput(value)
  const capacity = evaluateCrmSearchCapacityHealth(input.capacity)
  const keywordErrorBasisPoints = input.keyword.requests === 0
    ? 0
    : Math.floor((input.keyword.failures * 10_000) / input.keyword.requests)
  const alerts: Array<{ signal: string, action: 'alert' | 'dashboard' }> = []
  if (keywordErrorBasisPoints >= 100) alerts.push({ signal: 'keyword_error_rate', action: 'alert' })
  if ((input.oldestAgeSeconds.queue ?? 0) >= 900) alerts.push({ signal: 'queue_age', action: 'alert' })
  if (input.counts.retryable > 0) alerts.push({ signal: 'retryable_operations', action: 'dashboard' })

  return Object.freeze({
    global: input.global,
    counts: input.counts,
    capacity,
    oldestAgeSeconds: input.oldestAgeSeconds,
    schema: input.schema,
    dependency: input.dependency,
    freshness: input.freshness,
    cost: {
      globalBudgetUsedBasisPoints: input.cost.globalBudgetUsedBasisPoints,
      clientsNearBudget: input.cost.clientsNearBudget,
      configuredGlobalBudgetUsdMicros: input.cost.configuredGlobalBudgetUsdMicros,
      budgetState: input.cost.configuredGlobalBudgetUsdMicros === 0 ? 'disabled' : 'configured'
    },
    fallbacks: input.fallbacks,
    security: input.security,
    alerts: Object.freeze(alerts)
  })
}

interface HealthAggregateRow extends Record<string, unknown> {
  state: CrmSearchGlobalState
  revision: number
  maximum_mode: 'off' | 'shadow' | 'assist'
  indexing_ready: boolean
  dirty: number
  pending: number
  operations_total: number
  provider_pending: number
  retryable: number
  dead_letters: number
  oldest_dirty_age: number | null
  oldest_operation_age: number | null
  queue_age: number | null
  queue_pending: number
  max_indexing_provider_calls: number
  configured_global_budget_usd_micros: number
  global_budget_used_basis_points: number
  clients_near_budget: number
  stale_clients: number
  source_high_watermark_lag: number
  p95_revision_lag: number | null
  workers_ai_open_attempts: number
  workers_ai_open_age: number | null
  vectorize_open_attempts: number
  vectorize_open_age: number | null
  keyword_requests: number
  keyword_failures: number
  cross_scope_rejections: number
}

export async function loadCrmSearchHealth(organisationScopeId: string) {
  const row = await queryOneFresh<HealthAggregateRow>(`
    SELECT control.state, control.revision::INT, control.maximum_mode, control.indexing_ready,
      (SELECT COUNT(*)::INT FROM crm_search_source_dirty dirty
        WHERE dirty.organisation_scope_id = control.organisation_scope_id) AS dirty,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state IN ('pending_transport','queued','processing','admitted')) AS pending,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id) AS operations_total,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state = 'provider_pending') AS provider_pending,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state = 'retryable') AS retryable,
      (SELECT COUNT(*)::INT FROM crm_search_dead_letters dead_letter
        WHERE dead_letter.organisation_scope_id = control.organisation_scope_id
          AND dead_letter.resolution_state = 'open') AS dead_letters,
      (SELECT EXTRACT(EPOCH FROM NOW() - MIN(dirty.created_at))::INT
         FROM crm_search_source_dirty dirty
        WHERE dirty.organisation_scope_id = control.organisation_scope_id) AS oldest_dirty_age,
      (SELECT EXTRACT(EPOCH FROM NOW() - MIN(operation.created_at))::INT
         FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state NOT IN ('confirmed','superseded')) AS oldest_operation_age,
      (SELECT EXTRACT(EPOCH FROM NOW() - MIN(operation.created_at))::INT
         FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state IN ('pending_transport','queued')) AS queue_age,
      (SELECT COUNT(*)::INT FROM crm_search_operations operation
        WHERE operation.organisation_scope_id = control.organisation_scope_id
          AND operation.state IN ('pending_transport','queued')) AS queue_pending,
      control.max_indexing_provider_calls::INT,
      (control.daily_query_budget_usd_micros
        + control.daily_indexing_budget_usd_micros)::BIGINT AS configured_global_budget_usd_micros,
      (SELECT CASE
          WHEN COALESCE(SUM(usage.cap_charged_usd_micros), 0) = 0 THEN 0
          ELSE FLOOR(
            COALESCE(SUM(usage.reserved_usd_micros), 0) * 10000.0
              / SUM(usage.cap_charged_usd_micros)
          )::INT
        END
        FROM crm_search_usage_daily usage
        WHERE usage.organisation_scope_id = control.organisation_scope_id
          AND usage.usage_scope = 'global'
          AND usage.usage_date = CURRENT_DATE) AS global_budget_used_basis_points,
      (SELECT COUNT(*)::INT FROM (
        SELECT usage.client_id
          FROM crm_search_usage_daily usage
         WHERE usage.organisation_scope_id = control.organisation_scope_id
           AND usage.usage_scope = 'client'
           AND usage.usage_date = CURRENT_DATE
         GROUP BY usage.client_id
        HAVING SUM(usage.cap_charged_usd_micros) > 0
           AND SUM(usage.reserved_usd_micros) * 10 >= SUM(usage.cap_charged_usd_micros) * 8
      ) near_budget) AS clients_near_budget,
      (SELECT COUNT(*)::INT FROM crm_search_policies policy
        WHERE policy.organisation_scope_id = control.organisation_scope_id
          AND policy.approved_control_revision IS DISTINCT FROM control.revision) AS stale_clients,
      (SELECT COALESCE(MAX(GREATEST(
          schema.captured_source_high_watermark - schema.confirmed_source_high_watermark, 0
        )), 0)::INT
         FROM crm_search_schema_versions schema
        WHERE schema.organisation_scope_id = control.organisation_scope_id
      ) AS source_high_watermark_lag,
      (SELECT CEIL(PERCENTILE_CONT(0.95) WITHIN GROUP (
          ORDER BY GREATEST(source.source_revision - COALESCE(source.confirmed_revision, 0), 0)
        ))::INT
         FROM (
           SELECT current_source.entity_type, current_source.entity_id,
                  current_source.search_revision AS source_revision,
                  MAX(document.source_revision) FILTER (
                    WHERE document.confirmation_state = 'indexed'
                      AND document.tombstoned = FALSE
                  ) AS confirmed_revision
             FROM (
               SELECT 'person'::TEXT AS entity_type, person.id AS entity_id, person.client_id,
                      person.search_revision
                 FROM crm_people person WHERE person.deleted_at IS NULL
               UNION ALL
               SELECT 'company', company.id, company.client_id, company.search_revision
                 FROM crm_companies company WHERE company.deleted_at IS NULL
               UNION ALL
               SELECT 'opportunity', opportunity.id, opportunity.client_id,
                      opportunity.search_revision
                 FROM crm_opportunities opportunity WHERE opportunity.deleted_at IS NULL
             ) current_source
             JOIN crm_search_policies policy
               ON policy.organisation_scope_id = control.organisation_scope_id
              AND policy.client_id = current_source.client_id
             LEFT JOIN crm_search_documents document
               ON document.organisation_scope_id = policy.organisation_scope_id
              AND document.client_id = policy.client_id
              AND document.entity_type = current_source.entity_type
              AND document.entity_id = current_source.entity_id
            GROUP BY current_source.entity_type, current_source.entity_id,
                     current_source.client_id,
                     current_source.search_revision
         ) source
      ) AS p95_revision_lag,
      (SELECT COUNT(*)::INT FROM crm_search_provider_attempts attempt
        WHERE attempt.organisation_scope_id = control.organisation_scope_id
          AND attempt.provider = 'workers_ai'
          AND attempt.state IN ('sent','ambiguous')) AS workers_ai_open_attempts,
      (SELECT EXTRACT(EPOCH FROM NOW() - MIN(COALESCE(attempt.sent_at, attempt.created_at)))::INT
         FROM crm_search_provider_attempts attempt
        WHERE attempt.organisation_scope_id = control.organisation_scope_id
          AND attempt.provider = 'workers_ai'
          AND attempt.state IN ('sent','ambiguous')) AS workers_ai_open_age,
      (SELECT COUNT(*)::INT FROM crm_search_provider_attempts attempt
        WHERE attempt.organisation_scope_id = control.organisation_scope_id
          AND attempt.provider = 'vectorize'
          AND attempt.state IN ('sent','ambiguous')) AS vectorize_open_attempts,
      (SELECT EXTRACT(EPOCH FROM NOW() - MIN(COALESCE(attempt.sent_at, attempt.created_at)))::INT
         FROM crm_search_provider_attempts attempt
        WHERE attempt.organisation_scope_id = control.organisation_scope_id
          AND attempt.provider = 'vectorize'
          AND attempt.state IN ('sent','ambiguous')) AS vectorize_open_age,
      (SELECT COALESCE(SUM(event.request_count),0)::INT FROM crm_search_daily_events event
        WHERE event.organisation_scope_id = control.organisation_scope_id
          AND event.event_date >= CURRENT_DATE - 1) AS keyword_requests,
      (SELECT COALESCE(SUM(event.fallback_count),0)::INT FROM crm_search_daily_events event
        WHERE event.organisation_scope_id = control.organisation_scope_id
          AND event.event_date >= CURRENT_DATE - 1) AS keyword_failures,
      (SELECT COUNT(*)::INT FROM crm_search_events event
        WHERE event.organisation_scope_id = control.organisation_scope_id
          AND event.status_class = 'security_rejection'
          AND event.created_at >= NOW() - INTERVAL '24 hours') AS cross_scope_rejections
    FROM crm_search_global_control control
    WHERE control.organisation_scope_id = $1::UUID
  `, [organisationScopeId])
  if (!row) throw new Error('crm_search_health_unavailable')

  const schemas = await queryRowsFresh<{ version: string, role: CrmSearchSchemaRole, confirmed_vectors: number }>(`
    SELECT schema.schema_version AS version, schema.role,
           COUNT(document.id)::INT AS confirmed_vectors
      FROM crm_search_schema_versions schema
      LEFT JOIN crm_search_documents document
        ON document.organisation_scope_id = schema.organisation_scope_id
       AND document.schema_version = schema.schema_version
       AND document.confirmation_state = 'indexed'
       AND document.tombstoned = FALSE
     WHERE schema.organisation_scope_id = $1::UUID
     GROUP BY schema.schema_version, schema.role
     ORDER BY CASE role WHEN 'active' THEN 1 WHEN 'candidate' THEN 2 ELSE 3 END, schema_version
  `, [organisationScopeId])
  const fallbacks = await queryRowsFresh<{ fallback_class: string, count: number }>(`
    SELECT fallback_class, COUNT(*)::INT AS count
      FROM crm_search_events
     WHERE organisation_scope_id = $1::UUID
       AND created_at >= NOW() - INTERVAL '24 hours'
       AND fallback_class IS NOT NULL AND fallback_class <> 'none'
     GROUP BY fallback_class
     ORDER BY fallback_class
  `, [organisationScopeId])
  const dependencyStatus = (open: number, age: number | null): 'ok' | 'degraded' | 'down' => {
    if ((age ?? 0) >= 900) return 'down'
    if (open > 0 || (age ?? 0) >= 300) return 'degraded'
    return 'ok'
  }
  const workersAiOpenAttempts = Number(row.workers_ai_open_attempts)
  const vectorizeOpenAttempts = Number(row.vectorize_open_attempts)
  const queuePending = Number(row.queue_pending)
  return buildCrmSearchHealthView({
    global: {
      state: row.state,
      revision: Number(row.revision),
      maximumMode: row.maximum_mode,
      indexingReady: row.indexing_ready
    },
    counts: {
      dirty: Number(row.dirty), pending: Number(row.pending), providerPending: Number(row.provider_pending),
      retryable: Number(row.retryable), deadLetters: Number(row.dead_letters)
    },
    capacity: {
      dirty: { used: Number(row.dirty), limit: CRM_SEARCH_DURABLE_TABLE_CAPACITIES.dirty },
      operations: {
        used: Number(row.operations_total), limit: CRM_SEARCH_DURABLE_TABLE_CAPACITIES.operations
      }
    },
    oldestAgeSeconds: {
      dirty: row.oldest_dirty_age, operation: row.oldest_operation_age, queue: row.queue_age
    },
    schema: schemas.map(schema => ({
      version: schema.version, role: schema.role, confirmedVectors: Number(schema.confirmed_vectors)
    })),
    dependency: [
      { name: 'neon', status: 'ok', evidence: { querySucceeded: true } },
      {
        name: 'workers_ai',
        status: dependencyStatus(workersAiOpenAttempts, row.workers_ai_open_age),
        evidence: {
          openAttempts: workersAiOpenAttempts,
          oldestOpenAgeSeconds: row.workers_ai_open_age
        }
      },
      {
        name: 'vectorize',
        status: dependencyStatus(vectorizeOpenAttempts, row.vectorize_open_age),
        evidence: {
          openAttempts: vectorizeOpenAttempts,
          oldestOpenAgeSeconds: row.vectorize_open_age
        }
      },
      {
        name: 'queue',
        status: dependencyStatus(queuePending, row.queue_age),
        evidence: { pendingOperations: queuePending, oldestAgeSeconds: row.queue_age }
      }
    ],
    freshness: {
      staleClients: Number(row.stale_clients),
      sourceHighWatermarkLag: Number(row.source_high_watermark_lag),
      p95RevisionLag: row.p95_revision_lag
    },
    cost: {
      globalBudgetUsedBasisPoints: Number(row.global_budget_used_basis_points),
      clientsNearBudget: Number(row.clients_near_budget),
      configuredGlobalBudgetUsdMicros: Number(row.configured_global_budget_usd_micros)
    },
    keyword: { requests: Number(row.keyword_requests), failures: Number(row.keyword_failures) },
    fallbacks: Object.fromEntries(fallbacks.map(item => [item.fallback_class, Number(item.count)])),
    security: { crossScopeCandidateRejections: Number(row.cross_scope_rejections) }
  })
}

export async function listCrmSearchPolicies(organisationScopeId: string) {
  return await queryRowsFresh<Record<string, unknown>>(`
    SELECT policy.client_id::TEXT AS "clientId", client.name AS "clientName",
           policy.lifecycle_state AS state, policy.effective_mode AS mode,
           policy.indexing_enabled AS "indexingEnabled", policy.revision::INT,
           policy.active_schema_version AS "activeSchemaVersion",
           policy.candidate_schema_version AS "candidateSchemaVersion",
           policy.approved_evaluation_run_id::TEXT AS "evaluationRunId",
           control.revision::INT AS "controlRevision"
      FROM crm_search_policies policy
      JOIN crm_search_global_control control
        ON control.organisation_scope_id = policy.organisation_scope_id
      JOIN agency_clients client ON client.id = policy.client_id
     WHERE policy.organisation_scope_id = $1::UUID
     ORDER BY client.name, policy.client_id
  `, [organisationScopeId])
}

export async function listCrmSearchDeadLetters(organisationScopeId: string) {
  return await queryRowsFresh<Record<string, unknown>>(`
    SELECT dead_letter.id::TEXT, dead_letter.operation_id::TEXT AS "operationId",
           dead_letter.client_id::TEXT AS "clientId", dead_letter.origin,
           dead_letter.resolution_state AS "resolutionState", dead_letter.attempts::INT,
           dead_letter.error_class AS "errorClass", dead_letter.last_failed_at AS "lastFailedAt",
           to_char(dead_letter.updated_at AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS revision,
           operation.lease_generation::INT AS generation
      FROM crm_search_dead_letters dead_letter
      JOIN crm_search_operations operation ON operation.id = dead_letter.operation_id
     WHERE dead_letter.organisation_scope_id = $1::UUID
     ORDER BY dead_letter.last_failed_at DESC
     LIMIT 200
  `, [organisationScopeId])
}

export async function loadCrmSearchTelemetry(organisationScopeId: string) {
  const rows = await queryRowsFresh<Record<string, unknown>>(`
    SELECT event_date AS date, mode, surface, status_class AS "statusClass",
           SUM(request_count)::INT AS "requestCount",
           SUM(fallback_count)::INT AS "fallbackCount",
           SUM(timeout_count)::INT AS "timeoutCount",
           SUM(late_billed_completion_count)::INT AS "lateBilledCompletionCount",
           SUM(latency_count)::INT AS "latencyCount",
           SUM(latency_sum_ms)::BIGINT AS "latencySumMs",
           MAX(latency_max_ms)::INT AS "latencyMaxMs"
      FROM crm_search_daily_events
     WHERE organisation_scope_id = $1::UUID
       AND event_date >= CURRENT_DATE - 30
     GROUP BY event_date, mode, surface, status_class
     ORDER BY event_date DESC, mode, surface, status_class
  `, [organisationScopeId])
  const integerFields = [
    'requestCount', 'fallbackCount', 'timeoutCount', 'lateBilledCompletionCount',
    'latencyCount', 'latencySumMs', 'latencyMaxMs'
  ] as const
  return rows.map((row) => {
    const normalized = { ...row }
    for (const field of integerFields) {
      const numeric = Number(row[field])
      if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('crm_search_telemetry_unavailable')
      normalized[field] = numeric
    }
    return normalized
  })
}
