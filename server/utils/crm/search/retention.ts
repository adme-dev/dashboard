import type { H3Event } from 'h3'
import { queryOne, queryRows, transactionWithoutRetry } from '~~/server/utils/db'

export const CRM_SEARCH_RETENTION_DEFAULTS = Object.freeze({
  detailedEventsDays: 30,
  dailyAggregatesDays: 180,
  usageAndRateCardsDays: 400,
  confirmedOperationsDays: 90,
  resolvedDeadLettersDays: 180,
  confirmedTombstonesAndTeardownsDays: 90,
  evaluationPolicyAndSecurityEvidenceDays: 730
})

export interface CrmSearchRetentionBatch {
  targetTable: string
  partitionName: string
  expireThrough: string
  highWatermarkHash: string
  deletionManifestHash: string
}

export interface CrmSearchRetentionRunInput {
  now: string
  executorId: string
  batchLimit: number
}

export interface CrmSearchRetentionDependencies {
  aggregateDetailedEventsThrough(expireThrough: string): Promise<unknown>
  listRetentionBatches(input: CrmSearchRetentionRunInput): Promise<CrmSearchRetentionBatch[]>
  expireGovernedRows(input: {
    targetTable: string
    partitionName: string
    expireThrough: string
    expectedHighWatermarkHash: string
    deletionManifestHash: string
    executorId: string
    batchLimit: number
  }): Promise<{
    rowCount: number
    complete: boolean
    attestationHash: string
    legalHoldBlockedCount?: number
    dependencyBlockedCount?: number
  }>
  listRetiredAnalyticsKeys(): Promise<Array<{ keyVersion: string, retiredAt: string }>>
  retireAnalyticsKeyIfUnreferenced(keyVersion: string, evidence: {
    reason: 'last_reference_expired'
    now: string
    executorId: string
  }): Promise<{ retired: boolean, receiptSha256?: string }>
  listPendingClientErasures(): Promise<Array<{
    clientId: string
    requestedAt: string
    databaseTombstoneRecorded: boolean
    providerAbsenceConfirmed: boolean
  }>>
  getLastSuccessfulPurgeAt?(): Promise<string | null>
  emitAlert(alert: Record<string, unknown>): Promise<unknown> | unknown
  recordRetentionRun(result: Record<string, unknown>): Promise<unknown>
}

export interface ClientErasureSlaInput {
  requestedAt: string
  now: string
  databaseTombstoneRecorded: boolean
  providerAbsenceConfirmed: boolean
}

export type ClientErasureSlaStatus = 'complete' | 'on_target' | 'warning' | 'page' | 'privacy_incident'

export function assessClientErasureSla(input: ClientErasureSlaInput): {
  status: ClientErasureSlaStatus
  complete: boolean
  elapsedMinutes: number
} {
  const requestedAt = Date.parse(input.requestedAt)
  const now = Date.parse(input.now)
  if (!Number.isFinite(requestedAt) || !Number.isFinite(now) || now < requestedAt) {
    throw new Error('Invalid CRM search client-erasure timestamps')
  }
  const elapsedMinutes = Math.floor((now - requestedAt) / 60_000)
  if (input.databaseTombstoneRecorded && input.providerAbsenceConfirmed) {
    return { status: 'complete', complete: true, elapsedMinutes }
  }
  if (elapsedMinutes >= 1_440) return { status: 'privacy_incident', complete: false, elapsedMinutes }
  if (elapsedMinutes >= 240) return { status: 'page', complete: false, elapsedMinutes }
  if (elapsedMinutes >= 60) return { status: 'warning', complete: false, elapsedMinutes }
  return { status: 'on_target', complete: false, elapsedMinutes }
}

export async function runCrmSearchRetention(
  input: CrmSearchRetentionRunInput,
  dependencies: CrmSearchRetentionDependencies
): Promise<{
  deletedRows: number
  attestations: string[]
  complete: boolean
  legalHoldBlockedCount: number
  destroyedAnalyticsKeyVersions: string[]
  erasureAlerts: number
}> {
  const nowMs = Date.parse(input.now)
  if (!Number.isFinite(nowMs) || !Number.isInteger(input.batchLimit)
    || input.batchLimit < 1 || input.batchLimit > 5_000 || !input.executorId) {
    throw new Error('Invalid CRM search retention run')
  }

  await dependencies.aggregateDetailedEventsThrough(input.now)
  const batches = await dependencies.listRetentionBatches(input)
  let deletedRows = 0
  let complete = true
  let legalHoldBlockedCount = 0
  const attestations: string[] = []
  for (const batch of batches) {
    const outcome = await dependencies.expireGovernedRows({
      targetTable: batch.targetTable,
      partitionName: batch.partitionName,
      expireThrough: batch.expireThrough,
      expectedHighWatermarkHash: batch.highWatermarkHash,
      deletionManifestHash: batch.deletionManifestHash,
      executorId: input.executorId,
      batchLimit: input.batchLimit
    })
    deletedRows += outcome.rowCount
    legalHoldBlockedCount += outcome.legalHoldBlockedCount ?? 0
    complete &&= outcome.complete
    attestations.push(outcome.attestationHash)
  }

  const destroyedAnalyticsKeyVersions: string[] = []
  for (const retired of await dependencies.listRetiredAnalyticsKeys()) {
    const outcome = await dependencies.retireAnalyticsKeyIfUnreferenced(retired.keyVersion, {
      reason: 'last_reference_expired',
      now: input.now,
      executorId: input.executorId
    })
    if (outcome.retired) destroyedAnalyticsKeyVersions.push(retired.keyVersion)
  }

  let erasureAlerts = 0
  for (const erasure of await dependencies.listPendingClientErasures()) {
    const sla = assessClientErasureSla({ ...erasure, now: input.now })
    if (sla.status === 'warning' || sla.status === 'page' || sla.status === 'privacy_incident') {
      await dependencies.emitAlert({
        severity: sla.status === 'warning' ? 'warning' : 'page',
        reason: sla.status,
        clientId: erasure.clientId,
        elapsedMinutes: sla.elapsedMinutes
      })
      erasureAlerts += 1
    }
  }

  if (dependencies.getLastSuccessfulPurgeAt) {
    const lastSuccess = await dependencies.getLastSuccessfulPurgeAt()
    if (!lastSuccess || !Number.isFinite(Date.parse(lastSuccess))
      || nowMs - Date.parse(lastSuccess) >= 24 * 60 * 60 * 1_000) {
      await dependencies.emitAlert({ severity: 'page', reason: 'purge_stale_24h' })
    }
  }

  const result = {
    deletedRows,
    attestations,
    complete,
    legalHoldBlockedCount,
    destroyedAnalyticsKeyVersions,
    erasureAlerts
  }
  await dependencies.recordRetentionRun({ ...result, executorId: input.executorId, completedAt: input.now })
  return result
}

interface CrmSearchAnalyticsKeyManager {
  listRetiredKeys(): Promise<Array<{ keyVersion: string, retiredAt: string }>>
  destroyRetiredKey(keyVersion: string, evidence: {
    reason: 'last_reference_expired'
    now: string
    retirementIntentId: string
    executorId: string
  }): Promise<{ receiptSha256: string }>
}

const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u
const digestPattern = /^[a-f0-9]{64}$/u

export const CRM_SEARCH_RETENTION_TARGETS = Object.freeze([
  ['crm_search_schema_versions', 'crm_search_schema_versions'],
  ['crm_search_rate_card_revocations', 'crm_search_rate_card_revocations'],
  ['crm_search_documents', 'crm_search_documents'],
  ['crm_search_usage_daily', 'crm_search_usage_daily'],
  ['crm_search_usage_reservations', 'crm_search_usage_reservations'],
  ['crm_search_provider_attempts', 'crm_search_provider_attempts'],
  ['crm_search_dead_letters', 'crm_search_dead_letters'],
  ['crm_search_operations', 'crm_search_operations'],
  ['crm_search_events', 'crm_search_events_default'],
  ['crm_search_daily_events', 'crm_search_daily_events'],
  ['crm_search_evaluation_approval_revocations', 'crm_search_evaluation_approval_revocations'],
  ['crm_search_evaluation_approval_consumptions', 'crm_search_evaluation_approval_consumptions'],
  ['crm_search_evaluation_approvals', 'crm_search_evaluation_approvals'],
  ['crm_search_evaluation_query_evidence', 'crm_search_evaluation_query_evidence'],
  ['crm_search_evaluation_runs', 'crm_search_evaluation_runs'],
  ['crm_search_change_approval_revocations', 'crm_search_change_approval_revocations'],
  ['crm_search_change_approval_consumptions', 'crm_search_change_approval_consumptions'],
  ['crm_search_change_approvals', 'crm_search_change_approvals'],
  ['crm_search_teardown_vectors', 'crm_search_teardown_vectors'],
  ['crm_search_client_teardowns', 'crm_search_client_teardowns'],
  ['crm_search_audit_log', 'crm_search_audit_log_default'],
  ['crm_search_rate_cards', 'crm_search_rate_cards']
] as const)

async function listDatabaseRetentionBatches(input: CrmSearchRetentionRunInput): Promise<CrmSearchRetentionBatch[]> {
  const batches: CrmSearchRetentionBatch[] = []
  for (const [targetTable, partitionName] of CRM_SEARCH_RETENTION_TARGETS) {
    const row = await queryOne<Record<string, unknown>>(`
      WITH watermark AS (
        SELECT pending_expire_through, high_watermark_hash
        FROM crm_search_retention_high_watermarks
        WHERE target_table = $1 AND partition_name = $2
      ), cutoff AS (
        SELECT COALESCE(
          (SELECT pending_expire_through FROM watermark),
          $3::TIMESTAMPTZ
        ) AS expire_through
      ), candidates AS (
        SELECT retained.id, retained.retention_expires_at
        FROM ${partitionName} retained, cutoff
        WHERE retained.retention_expires_at <= cutoff.expire_through
          AND (
            retained.legal_hold_id IS NULL
            OR EXISTS (
              SELECT 1 FROM crm_search_legal_hold_releases direct_release
              WHERE direct_release.legal_hold_id = retained.legal_hold_id
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM crm_search_legal_hold_targets held_target
            LEFT JOIN crm_search_legal_hold_releases hold_release
              ON hold_release.legal_hold_id = held_target.legal_hold_id
            WHERE held_target.target_table = $1
              AND held_target.target_row_id = retained.id
              AND hold_release.id IS NULL
          )
          AND NOT crm_search_retention_row_has_dependents($1, retained.id)
        ORDER BY retained.retention_expires_at, retained.id
        LIMIT $4
      ), candidate_list AS (
        SELECT COALESCE(
          array_agg(id ORDER BY retention_expires_at, id),
          ARRAY[]::UUID[]
        ) AS ids
        FROM candidates
      )
      SELECT
        cutoff.expire_through,
        COALESCE((SELECT high_watermark_hash FROM watermark), repeat('0', 64)) AS high_watermark_hash,
        crm_search_projection_hash(concat_ws(
          '|', $1, $2, cutoff.expire_through::TEXT,
          COALESCE(array_to_string(candidate_list.ids, ','), '')
        )) AS deletion_manifest_hash,
        cardinality(candidate_list.ids) AS candidate_count
      FROM cutoff, candidate_list
    `, [targetTable, partitionName, input.now, input.batchLimit])
    if (!row) throw new Error('CRM search retention manifest query returned no result')
    batches.push({
      targetTable,
      partitionName,
      expireThrough: row.expire_through instanceof Date
        ? row.expire_through.toISOString()
        : String(row.expire_through),
      highWatermarkHash: String(row.high_watermark_hash),
      deletionManifestHash: String(row.deletion_manifest_hash)
    })
  }
  return batches
}

function projectManagerResponse(value: unknown): { receiptSha256: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('CRM search analytics key manager response invalid')
  }
  const response = value as Record<string, unknown>
  if (Object.keys(response).length !== 2 || response.status !== 'destroyed'
    || typeof response.receiptSha256 !== 'string'
    || !digestPattern.test(response.receiptSha256)) {
    throw new Error('CRM search analytics key manager response invalid')
  }
  return { receiptSha256: response.receiptSha256 }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    throw new Error('CRM search service response invalid')
  }
  const text = await response.text()
  if (text.length < 2 || text.length > 32_768) throw new Error('CRM search service response invalid')
  return JSON.parse(text) as unknown
}

export function createCrmSearchRetentionDependencies(
  event: H3Event,
  overrides: Partial<Pick<CrmSearchRetentionDependencies, 'retireAnalyticsKeyIfUnreferenced'>> & {
    transaction?: typeof transactionWithoutRetry
  } = {}
): CrmSearchRetentionDependencies {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const managerBinding = env?.CRM_SEARCH_ANALYTICS_KEY_MANAGER
  const alertBinding = env?.CRM_SEARCH_RETENTION_ALERTS
  if (!managerBinding || typeof managerBinding !== 'object'
    || typeof (managerBinding as { fetch?: unknown }).fetch !== 'function') {
    throw new Error('CRM search analytics key manager binding unavailable')
  }
  if (!alertBinding || typeof alertBinding !== 'object'
    || typeof (alertBinding as { send?: unknown }).send !== 'function') {
    throw new Error('CRM search retention alert binding unavailable')
  }
  const managerFetch = (managerBinding as {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }).fetch.bind(managerBinding)
  const keyManager: CrmSearchAnalyticsKeyManager = {
    async listRetiredKeys() {
      const result = await readJsonResponse(await managerFetch(
        'https://crm-search-key-manager.internal/v1/retired',
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) }
      ))
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).length !== 1
        || !Array.isArray((result as { keys?: unknown }).keys)
        || (result as { keys: unknown[] }).keys.length > 8) {
        throw new Error('CRM search analytics key manager response invalid')
      }
      return (result as { keys: unknown[] }).keys.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('CRM search analytics key manager response invalid')
        }
        const row = value as Record<string, unknown>
        if (Object.keys(row).length !== 2 || typeof row.keyVersion !== 'string'
          || !keyVersionPattern.test(row.keyVersion) || typeof row.retiredAt !== 'string'
          || !Number.isFinite(Date.parse(row.retiredAt))) {
          throw new Error('CRM search analytics key manager response invalid')
        }
        return { keyVersion: row.keyVersion, retiredAt: row.retiredAt }
      })
    },
    async destroyRetiredKey(keyVersion, evidence) {
      const response = await managerFetch('https://crm-search-key-manager.internal/v1/destroy', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ version: 'crm-search-key-retirement-v1', keyVersion, ...evidence }),
        signal: AbortSignal.timeout(5_000)
      })
      return projectManagerResponse(await readJsonResponse(response))
    }
  }
  const runTransaction = overrides.transaction ?? transactionWithoutRetry
  const retireAnalyticsKeyIfUnreferenced = overrides.retireAnalyticsKeyIfUnreferenced
    ?? (async (keyVersion: string, evidence: {
      reason: 'last_reference_expired'
      now: string
      executorId: string
    }) => {
      if (!keyVersionPattern.test(keyVersion)) throw new Error('CRM search analytics key version invalid')
      const intent = await runTransaction(async (database) => {
        const begun = await database.query(`
          SELECT intent_id, receipt_sha256
          FROM crm_search_begin_analytics_key_retirement(
            $1, $2, $3::UUID, $4::TIMESTAMPTZ
          )
        `, [keyVersion, evidence.reason, evidence.executorId, evidence.now])
        const row = begun.rows[0]
        if (!row) return null
        const intentId = String(row.intent_id ?? '')
        if (!intentId) throw new Error('CRM search analytics key retirement intent invalid')
        return {
          intentId,
          receiptSha256: row.receipt_sha256 == null ? null : String(row.receipt_sha256)
        }
      })
      if (!intent) return { retired: false }
      if (intent.receiptSha256) {
        if (!digestPattern.test(intent.receiptSha256)) {
          throw new Error('CRM search analytics key retirement receipt invalid')
        }
        return { retired: true, receiptSha256: intent.receiptSha256 }
      }

      // External destruction must never run inside a database transaction. If
      // its response is lost, the committed intent still rejects new event
      // references and the idempotent manager call can be retried safely.
      const receipt = await keyManager.destroyRetiredKey(keyVersion, {
        reason: evidence.reason,
        now: evidence.now,
        retirementIntentId: intent.intentId,
        executorId: evidence.executorId
      })
      await runTransaction(async (database) => {
        const recorded = await database.query(`
          SELECT crm_search_complete_analytics_key_retirement(
            $1::UUID, $2, $3::UUID, $4::TIMESTAMPTZ
          ) AS id
        `, [intent.intentId, receipt.receiptSha256, evidence.executorId, evidence.now])
        if (!recorded.rows[0]?.id) {
          throw new Error('CRM search analytics key retirement receipt was not recorded')
        }
      })
      return { retired: true, receiptSha256: receipt.receiptSha256 }
    })
  return {
    aggregateDetailedEventsThrough: async (expireThrough) => {
      await queryRows(`
        INSERT INTO crm_search_daily_events (
          event_date, organisation_scope_id, client_id, mode, surface, status_class,
          eligible_count, sampled_count, request_count, fallback_count, timeout_count,
          late_billed_completion_count, latency_count, latency_sum_ms, latency_max_ms
        )
        SELECT created_at::DATE, organisation_scope_id, client_id, mode, surface, status_class,
          COUNT(*), COUNT(*) FILTER (WHERE sampled), COUNT(*),
          COUNT(*) FILTER (WHERE fallback_class <> 'none'),
          COUNT(*) FILTER (WHERE fallback_class = 'deadline'),
          COUNT(*) FILTER (WHERE event_type = 'provider.late_completion'),
          COUNT(total_latency_ms), COALESCE(SUM(total_latency_ms), 0),
          COALESCE(MAX(total_latency_ms), 0)
        FROM crm_search_events
        WHERE created_at <= $1::TIMESTAMPTZ
        GROUP BY created_at::DATE, organisation_scope_id, client_id, mode, surface, status_class
        ON CONFLICT (event_date, organisation_scope_id, client_id, mode, surface, status_class)
        DO UPDATE SET
          eligible_count = EXCLUDED.eligible_count,
          sampled_count = EXCLUDED.sampled_count,
          request_count = EXCLUDED.request_count,
          fallback_count = EXCLUDED.fallback_count,
          timeout_count = EXCLUDED.timeout_count,
          late_billed_completion_count = EXCLUDED.late_billed_completion_count,
          latency_count = EXCLUDED.latency_count,
          latency_sum_ms = EXCLUDED.latency_sum_ms,
          latency_max_ms = EXCLUDED.latency_max_ms
      `, [expireThrough])
    },
    listRetentionBatches: listDatabaseRetentionBatches,
    expireGovernedRows: async (input) => {
      const row = await queryOne<{ result: Record<string, unknown> }>(`
        SELECT crm_search_expire_governed_rows(
          $1, $2, $3::TIMESTAMPTZ, $4, $5, $6::UUID, NULL, $7
        ) AS result
      `, [input.targetTable, input.partitionName, input.expireThrough,
        input.expectedHighWatermarkHash, input.deletionManifestHash,
        input.executorId, input.batchLimit])
      const result = row?.result
      if (!result) throw new Error('CRM search retention definer returned no result')
      return {
        rowCount: Number(result.rowCount ?? 0),
        complete: result.complete === true,
        attestationHash: String(result.attestationHash ?? ''),
        legalHoldBlockedCount: Number(result.legalHoldBlockedCount ?? 0),
        dependencyBlockedCount: Number(result.dependencyBlockedCount ?? 0)
      }
    },
    listRetiredAnalyticsKeys: () => keyManager.listRetiredKeys(),
    retireAnalyticsKeyIfUnreferenced,
    listPendingClientErasures: async () => queryRows(`
      SELECT client_id AS "clientId", requested_at AS "requestedAt",
        state IN ('provider_pending', 'confirmed') AS "databaseTombstoneRecorded",
        provider_deletion_state = 'confirmed_absent' AS "providerAbsenceConfirmed"
      FROM crm_search_client_teardowns
      WHERE state <> 'confirmed' OR provider_deletion_state <> 'confirmed_absent'
    `),
    getLastSuccessfulPurgeAt: async () => {
      const row = await queryOne<{ created_at: Date | string }>(`
        SELECT created_at
        FROM crm_search_audit_log
        WHERE event_type = 'retention.completed'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      return row?.created_at instanceof Date ? row.created_at.toISOString() : row ? String(row.created_at) : null
    },
    emitAlert: (alert) => {
      const severity = alert.severity
      const reason = alert.reason
      if ((severity !== 'warning' && severity !== 'page')
        || typeof reason !== 'string'
        || !['warning', 'page', 'privacy_incident', 'purge_stale_24h'].includes(reason)) {
        throw new Error('CRM search retention alert invalid')
      }
      const projected: Record<string, unknown> = {
        version: 'crm-search-retention-alert-v1', severity, reason
      }
      if (typeof alert.clientId === 'string') projected.clientId = alert.clientId
      if (typeof alert.elapsedMinutes === 'number') projected.elapsedMinutes = alert.elapsedMinutes
      return (alertBinding as { send(message: unknown): Promise<unknown> }).send(projected)
    },
    recordRetentionRun: async (result) => {
      const executorId = result.executorId
      if (typeof executorId !== 'string') throw new Error('CRM search retention executor is missing')
      await queryRows(`
        INSERT INTO crm_search_audit_log (
          organisation_scope_id, event_type, actor_id, correlation_id, reason, details
        )
        SELECT id,
          CASE WHEN $4::BOOLEAN THEN 'retention.completed' ELSE 'retention.partial' END,
          $1::UUID, gen_random_uuid(), $2, $3::JSONB
        FROM crm_search_organisation_scopes
      `, [executorId, 'Governed CRM search retention completed.', JSON.stringify({
        action: 'retention_run',
        rowCount: result.deletedRows,
        complete: result.complete
      }), result.complete === true])
    }
  }
}
