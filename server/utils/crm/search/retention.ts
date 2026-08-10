import type { H3Event } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'

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
  }>
  listRetiredAnalyticsKeys(): Promise<Array<{ keyVersion: string, retiredAt: string }>>
  countRetainedEventsForKeyVersion(keyVersion: string): Promise<number>
  destroyRetiredAnalyticsKey(keyVersion: string, evidence: { reason: 'last_reference_expired', now: string }): Promise<unknown>
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
    const references = await dependencies.countRetainedEventsForKeyVersion(retired.keyVersion)
    if (references !== 0) continue
    await dependencies.destroyRetiredAnalyticsKey(retired.keyVersion, {
      reason: 'last_reference_expired',
      now: input.now
    })
    destroyedAnalyticsKeyVersions.push(retired.keyVersion)
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
  destroyRetiredKey(keyVersion: string, evidence: { reason: 'last_reference_expired', now: string }): Promise<unknown>
}

interface CrmSearchRetentionAlerts {
  emit(alert: Record<string, unknown>): Promise<unknown> | unknown
}

function eventService<T>(event: H3Event, key: string): T | null {
  const value = (event.context as Record<string, unknown>)[key]
  return value && typeof value === 'object' ? value as T : null
}

export const CRM_SEARCH_RETENTION_TARGETS = Object.freeze([
  ['crm_search_schema_versions', 'crm_search_schema_versions'],
  ['crm_search_rate_cards', 'crm_search_rate_cards'],
  ['crm_search_rate_card_revocations', 'crm_search_rate_card_revocations'],
  ['crm_search_operations', 'crm_search_operations'],
  ['crm_search_provider_attempts', 'crm_search_provider_attempts'],
  ['crm_search_documents', 'crm_search_documents'],
  ['crm_search_usage_daily', 'crm_search_usage_daily'],
  ['crm_search_usage_reservations', 'crm_search_usage_reservations'],
  ['crm_search_events', 'crm_search_events_default'],
  ['crm_search_daily_events', 'crm_search_daily_events'],
  ['crm_search_evaluation_runs', 'crm_search_evaluation_runs'],
  ['crm_search_evaluation_query_evidence', 'crm_search_evaluation_query_evidence'],
  ['crm_search_evaluation_approvals', 'crm_search_evaluation_approvals'],
  ['crm_search_evaluation_approval_revocations', 'crm_search_evaluation_approval_revocations'],
  ['crm_search_evaluation_approval_consumptions', 'crm_search_evaluation_approval_consumptions'],
  ['crm_search_change_approvals', 'crm_search_change_approvals'],
  ['crm_search_change_approval_revocations', 'crm_search_change_approval_revocations'],
  ['crm_search_change_approval_consumptions', 'crm_search_change_approval_consumptions'],
  ['crm_search_audit_log', 'crm_search_audit_log_default'],
  ['crm_search_dead_letters', 'crm_search_dead_letters'],
  ['crm_search_client_teardowns', 'crm_search_client_teardowns'],
  ['crm_search_teardown_vectors', 'crm_search_teardown_vectors']
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

export function createCrmSearchRetentionDependencies(event: H3Event): CrmSearchRetentionDependencies {
  const keyManager = eventService<CrmSearchAnalyticsKeyManager>(event, 'crmSearchAnalyticsKeyManager')
  const alerts = eventService<CrmSearchRetentionAlerts>(event, 'crmSearchRetentionAlerts')
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
        attestationHash: String(result.attestationHash ?? '')
      }
    },
    listRetiredAnalyticsKeys: async () => keyManager?.listRetiredKeys() ?? [],
    countRetainedEventsForKeyVersion: async (keyVersion) => {
      const row = await queryOne<{ count: string }>(`
        SELECT COUNT(*)::TEXT AS count
        FROM crm_search_events
        WHERE query_digest_key_version = $1
      `, [keyVersion])
      return Number(row?.count ?? 0)
    },
    destroyRetiredAnalyticsKey: async (keyVersion, evidence) => {
      if (!keyManager) throw new Error('CRM search analytics key manager unavailable')
      return keyManager.destroyRetiredKey(keyVersion, evidence)
    },
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
      if (!alerts) throw new Error('CRM search retention alert transport unavailable')
      return alerts.emit(alert)
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
