import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './contracts'
import {
  createCrmSearchConfirmationTag,
  type CrmSearchConfirmationKeyring
} from './confirmation'
import { resolveCrmSearchConfirmationKeyring } from './bindings'
import { deriveCrmSearchVectorId } from './identity'
import { upsertCrmSearchOperation } from './operationRepository'
import {
  confirmStoredCrmSearchVector,
  resolveCrmSearchProviderRuntime,
  type CrmSearchStoredVector
} from './provider'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireDigest,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireUuid
} from './repository'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaPattern = /^crm-search-v[1-9][0-9]{0,5}$/
const hmacPattern = /^hmac-sha256:[a-f0-9]{64}$/
const keyVersionPattern = /^[A-Za-z0-9._:-]{1,80}$/

export interface ReconcileCrmSearchIndexInput {
  limit: number
  now: string
}

interface PendingConfirmation {
  operationId: string
  documentId: string
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  schemaRole: 'active' | 'candidate' | 'retiring'
  sourceRevision: number
  sourceEventSequence: number
  action: 'upsert' | 'delete'
  vectorId: string
  namespace: string
  confirmationTag: string | null
  confirmationKeyVersion: string | null
  providerMutationId: string | null
  providerAttemptCount: number
  confirmationAttemptCount: number
  confirmationDeadlineAt?: string
  ambiguousAttemptId?: string
  leaseToken: string
  leaseGeneration: number
}

interface CrmSearchReconciliationRuntime {
  vectorize: {
    getByIds(ids: string[]): Promise<CrmSearchStoredVector[]>
  }
}

interface ConfirmationMutationInput extends PendingConfirmation {
  confirmedAt: string
}

interface InventoryRepair {
  repairKind: 'missing' | 'stale' | 'orphaned' | 'retiring'
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  schemaRole: 'active' | 'candidate' | 'retiring'
  sourceRevision: number
  sourceEventSequence?: number
  desiredAction: 'upsert' | 'delete'
  vectorId: string
  namespace: string
  contentHash: string | null
  confirmationTag: string | null
  confirmationKeyVersion: string | null
}

export interface CrmSearchReconciliationDependencies {
  claimPendingConfirmations(input: ReconcileCrmSearchIndexInput): Promise<PendingConfirmation[]>
  claimInventoryRepairs(input: ReconcileCrmSearchIndexInput): Promise<InventoryRepair[]>
  confirmIndexed(input: ConfirmationMutationInput): Promise<boolean>
  confirmDeleted(input: ConfirmationMutationInput): Promise<boolean>
  rescheduleConfirmation(input: PendingConfirmation & {
    errorClass: string
    nextAttemptAt: string
    attemptedAt: string
  }): Promise<boolean>
  recoverAmbiguousAcceptance(input: PendingConfirmation & {
    ambiguousAttemptId: string
    recoveredAt: string
  }): Promise<boolean>
  recordConfirmationDeadLetter(input: PendingConfirmation & {
    origin: 'provider_confirmation'
    attempts: number
    errorClass: 'confirmation_exhausted'
    failedAt: string
  }): Promise<boolean>
  createRepairOperation(input: InventoryRepair & { repairedAt: string }): Promise<boolean>
  resolveRepairEvidence(input: InventoryRepair & { confirmedAt: string }): Promise<boolean>
  schedulePendingTeardowns(input: ReconcileCrmSearchIndexInput): Promise<{
    scheduled: number
    finalized: number
  }>
}

export interface CrmSearchReconciliationResult {
  claimed: number
  indexed: number
  deleted: number
  rescheduled: number
  deadLettered: number
  repairsCreated: number
}

interface CrmSearchReconciliationRunResult extends CrmSearchReconciliationResult {
  teardownsScheduled: number
  teardownsFinalized: number
}

function fail(code = 'crm_search_invalid_reconciliation'): never {
  throw new Error(code)
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validClaim(value: PendingConfirmation): boolean {
  const isUpsert = value?.action === 'upsert'
  return !!value
    && uuidPattern.test(value.operationId)
    && uuidPattern.test(value.documentId)
    && uuidPattern.test(value.organisationScopeId)
    && uuidPattern.test(value.clientId)
    && CRM_SEARCH_ENTITY_TYPES.includes(value.entityType)
    && uuidPattern.test(value.entityId)
    && schemaPattern.test(value.schemaVersion)
    && ['active', 'candidate', 'retiring'].includes(value.schemaRole)
    && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision >= 1
    && Number.isSafeInteger(value.sourceEventSequence) && value.sourceEventSequence >= 1
    && ['upsert', 'delete'].includes(value.action)
    && providerIdPattern.test(value.vectorId)
    && providerIdPattern.test(value.namespace)
    && (isUpsert
      ? typeof value.confirmationTag === 'string'
      && hmacPattern.test(value.confirmationTag)
      : value.confirmationTag === null)
    && (isUpsert
      ? typeof value.confirmationKeyVersion === 'string'
      && keyVersionPattern.test(value.confirmationKeyVersion)
      : value.confirmationKeyVersion === null)
    && (value.providerMutationId === null
      || (typeof value.providerMutationId === 'string' && value.providerMutationId.length <= 256))
    && Number.isSafeInteger(value.providerAttemptCount) && value.providerAttemptCount >= 1
    && Number.isSafeInteger(value.confirmationAttemptCount) && value.confirmationAttemptCount >= 0
    && uuidPattern.test(value.leaseToken)
    && Number.isSafeInteger(value.leaseGeneration) && value.leaseGeneration >= 1
    && (value.ambiguousAttemptId === undefined
      || (typeof value.ambiguousAttemptId === 'string' && value.ambiguousAttemptId.length <= 256))
}

function validRepair(value: InventoryRepair): boolean {
  const upsert = value?.desiredAction === 'upsert'
  return !!value
    && ['missing', 'stale', 'orphaned', 'retiring'].includes(value.repairKind)
    && uuidPattern.test(value.organisationScopeId)
    && uuidPattern.test(value.clientId)
    && CRM_SEARCH_ENTITY_TYPES.includes(value.entityType)
    && uuidPattern.test(value.entityId)
    && schemaPattern.test(value.schemaVersion)
    && ['active', 'candidate', 'retiring'].includes(value.schemaRole)
    && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision >= 1
    && (value.sourceEventSequence === undefined
      || (Number.isSafeInteger(value.sourceEventSequence) && value.sourceEventSequence >= 1))
    && ['upsert', 'delete'].includes(value.desiredAction)
    && providerIdPattern.test(value.vectorId)
    && providerIdPattern.test(value.namespace)
    && (upsert
      ? typeof value.contentHash === 'string'
      && /^[a-f0-9]{64}$/u.test(value.contentHash)
      : value.contentHash === null)
    && (upsert
      ? typeof value.confirmationTag === 'string'
      && hmacPattern.test(value.confirmationTag)
      : value.confirmationTag === null)
    && (upsert
      ? typeof value.confirmationKeyVersion === 'string'
      && keyVersionPattern.test(value.confirmationKeyVersion)
      : value.confirmationKeyVersion === null)
}

function nextAttemptAt(now: string, attempts: number): string {
  const delaySeconds = Math.min(900, 2 ** Math.min(9, Math.max(0, attempts)))
  return new Date(Date.parse(now) + delaySeconds * 1000).toISOString()
}

function exhausted(claim: PendingConfirmation, now: string): boolean {
  return claim.confirmationAttemptCount >= 10
    && timestamp(claim.confirmationDeadlineAt)
    && Date.parse(claim.confirmationDeadlineAt) <= Date.parse(now)
}

async function reschedule(
  claim: PendingConfirmation,
  errorClass: string,
  now: string,
  dependencies: CrmSearchReconciliationDependencies
): Promise<void> {
  const changed = await dependencies.rescheduleConfirmation({
    ...claim,
    errorClass,
    attemptedAt: now,
    nextAttemptAt: nextAttemptAt(now, claim.confirmationAttemptCount)
  })
  if (changed !== true) fail('crm_search_reconciliation_claim_changed')
}

export async function reconcileCrmSearchIndex(
  input: ReconcileCrmSearchIndexInput,
  runtime: CrmSearchReconciliationRuntime,
  dependencies: CrmSearchReconciliationDependencies
): Promise<CrmSearchReconciliationRunResult> {
  if (!input || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25
    || !timestamp(input.now) || !runtime?.vectorize || !dependencies) fail()
  const claims = await dependencies.claimPendingConfirmations({ ...input })
  if (!Array.isArray(claims) || claims.length > input.limit) fail()
  const result: CrmSearchReconciliationRunResult = {
    claimed: claims.length,
    indexed: 0,
    deleted: 0,
    rescheduled: 0,
    deadLettered: 0,
    repairsCreated: 0,
    teardownsScheduled: 0,
    teardownsFinalized: 0
  }
  for (const claimValue of claims) {
    if (!validClaim(claimValue)) fail()
    const claim = claimValue
    if (exhausted(claim, input.now)) {
      const recorded = await dependencies.recordConfirmationDeadLetter({
        ...claim,
        origin: 'provider_confirmation',
        attempts: claim.confirmationAttemptCount,
        errorClass: 'confirmation_exhausted',
        failedAt: input.now
      })
      if (recorded !== true) fail('crm_search_reconciliation_claim_changed')
      result.deadLettered += 1
      continue
    }

    let stored: CrmSearchStoredVector[]
    try {
      stored = await runtime.vectorize.getByIds([claim.vectorId])
    } catch {
      await reschedule(claim, 'provider_read_failed', input.now, dependencies)
      result.rescheduled += 1
      continue
    }
    if (!Array.isArray(stored) || stored.length > 1) {
      await reschedule(claim, 'provider_read_malformed', input.now, dependencies)
      result.rescheduled += 1
      continue
    }

    const exactUpsert = claim.action === 'upsert'
      && stored.length === 1
      && confirmStoredCrmSearchVector(stored[0], {
        id: claim.vectorId,
        namespace: claim.namespace,
        entityType: claim.entityType,
        schemaVersion: claim.schemaVersion,
        sourceRevision: claim.sourceRevision,
        confirmationTag: claim.confirmationTag!,
        confirmationKeyVersion: claim.confirmationKeyVersion!
      })
    const exactDelete = claim.action === 'delete' && stored.length === 0
    if (!exactUpsert && !exactDelete) {
      await reschedule(claim, 'provider_confirmation_pending', input.now, dependencies)
      result.rescheduled += 1
      continue
    }

    if (claim.ambiguousAttemptId) {
      const recovered = await dependencies.recoverAmbiguousAcceptance({
        ...claim,
        ambiguousAttemptId: claim.ambiguousAttemptId,
        recoveredAt: input.now
      })
      if (recovered !== true) fail('crm_search_reconciliation_claim_changed')
    }
    const mutationInput = { ...claim, confirmedAt: input.now }
    const changed = exactUpsert
      ? await dependencies.confirmIndexed(mutationInput)
      : await dependencies.confirmDeleted(mutationInput)
    if (changed !== true) fail('crm_search_reconciliation_claim_changed')
    if (exactUpsert) result.indexed += 1
    else result.deleted += 1
  }
  const teardown = await dependencies.schedulePendingTeardowns({ ...input })
  if (!teardown || !Number.isSafeInteger(teardown.scheduled) || teardown.scheduled < 0
    || teardown.scheduled > input.limit || !Number.isSafeInteger(teardown.finalized)
    || teardown.finalized < 0 || teardown.finalized > input.limit) fail()
  result.teardownsScheduled = teardown.scheduled
  result.teardownsFinalized = teardown.finalized

  const repairs = await dependencies.claimInventoryRepairs({ ...input })
  if (!Array.isArray(repairs) || repairs.length > input.limit) fail()
  for (const repair of repairs) {
    if (!validRepair(repair)) fail()
    let stored: CrmSearchStoredVector[]
    try {
      stored = await runtime.vectorize.getByIds([repair.vectorId])
    } catch {
      continue
    }
    if (!Array.isArray(stored) || stored.length > 1) continue
    const exactUpsert = repair.desiredAction === 'upsert'
      && stored.length === 1
      && confirmStoredCrmSearchVector(stored[0], {
        id: repair.vectorId,
        namespace: repair.namespace,
        entityType: repair.entityType,
        schemaVersion: repair.schemaVersion,
        sourceRevision: repair.sourceRevision,
        confirmationTag: repair.confirmationTag!,
        confirmationKeyVersion: repair.confirmationKeyVersion!
      })
    const exactDelete = repair.desiredAction === 'delete' && stored.length === 0
    if (exactUpsert || exactDelete) {
      if (!await dependencies.resolveRepairEvidence({ ...repair, confirmedAt: input.now })) {
        fail('crm_search_reconciliation_claim_changed')
      }
      continue
    }
    if (await dependencies.createRepairOperation({ ...repair, repairedAt: input.now })) {
      result.repairsCreated += 1
    }
  }
  return result
}

function mapPendingConfirmation(row: Record<string, unknown>): PendingConfirmation {
  return {
    operationId: requireUuid(row.operation_id, 'crm_search_invalid_reconciliation'),
    documentId: requireUuid(row.document_id, 'crm_search_invalid_reconciliation'),
    organisationScopeId: requireUuid(row.organisation_scope_id, 'crm_search_invalid_reconciliation'),
    clientId: requireUuid(row.client_id, 'crm_search_invalid_reconciliation'),
    entityType: String(row.entity_type) as CrmSearchEntityType,
    entityId: requireUuid(row.entity_id, 'crm_search_invalid_reconciliation'),
    schemaVersion: String(row.schema_version),
    schemaRole: String(row.schema_role) as PendingConfirmation['schemaRole'],
    sourceRevision: requireSafeInteger(row.source_revision, 'crm_search_invalid_reconciliation', { minimum: 1 }),
    sourceEventSequence: requireSafeInteger(row.source_event_sequence, 'crm_search_invalid_reconciliation', { minimum: 1 }),
    action: String(row.desired_action) as PendingConfirmation['action'],
    vectorId: String(row.vector_id),
    namespace: String(row.namespace),
    confirmationTag: row.confirmation_tag === null ? null : String(row.confirmation_tag),
    confirmationKeyVersion: row.confirmation_key_version === null
      ? null
      : String(row.confirmation_key_version),
    providerMutationId: row.provider_mutation_id === null ? null : String(row.provider_mutation_id),
    providerAttemptCount: requireSafeInteger(row.provider_attempt_count,
      'crm_search_invalid_reconciliation', { minimum: 1, maximum: 1000 }),
    confirmationAttemptCount: requireSafeInteger(row.confirmation_attempt_count,
      'crm_search_invalid_reconciliation', { maximum: 1000 }),
    confirmationDeadlineAt: String(row.confirmation_deadline_at),
    ...(row.ambiguous_attempt_id === null
      ? {}
      : { ambiguousAttemptId: requireUuid(row.ambiguous_attempt_id, 'crm_search_invalid_reconciliation') }),
    leaseToken: requireUuid(row.lease_token, 'crm_search_invalid_reconciliation'),
    leaseGeneration: requireSafeInteger(row.lease_generation,
      'crm_search_invalid_reconciliation', { minimum: 1 })
  }
}

export function createDefaultCrmSearchReconciliationDependencies(
  confirmationKeyring: CrmSearchConfirmationKeyring | null = null
): CrmSearchReconciliationDependencies {
  return {
    async claimPendingConfirmations(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        const claimed = await transaction.query(`
          WITH claimable AS (
            SELECT document.id AS document_id, operation.id AS operation_id,
                   operation.lease_token AS operation_lease_token,
                   operation.lease_generation AS operation_lease_generation
            FROM crm_search_documents document
            JOIN crm_search_operations operation
              ON operation.organisation_scope_id = document.organisation_scope_id
             AND operation.client_id = document.client_id
             AND operation.entity_type = document.entity_type
             AND operation.entity_id = document.entity_id
             AND operation.schema_version = document.schema_version
             AND operation.source_revision = document.source_revision
             AND operation.source_event_sequence = document.source_event_sequence
            WHERE document.confirmation_state IN ('provider_pending', 'delete_pending')
              AND operation.state IN ('admitted', 'provider_pending')
              AND (document.lease_expires_at IS NULL OR document.lease_expires_at <= $1)
              AND operation.next_attempt_at <= $1::TIMESTAMPTZ
              AND (operation.state = 'provider_pending' OR EXISTS (
                SELECT 1 FROM crm_search_provider_attempts attempt
                WHERE attempt.operation_id = operation.id
                  AND attempt.provider = 'vectorize'
                  AND attempt.state = 'ambiguous'
              ))
            ORDER BY operation.next_attempt_at, document.updated_at, document.id
            LIMIT $2
            FOR UPDATE OF document, operation SKIP LOCKED
          ), leased_documents AS (
            UPDATE crm_search_documents document
            SET lease_token = claimable.operation_lease_token,
                lease_generation = claimable.operation_lease_generation,
                lease_expires_at = $1::TIMESTAMPTZ + INTERVAL '60 seconds',
                updated_at = $1
            FROM claimable
            WHERE document.id = claimable.document_id
            RETURNING document.*
          ), attempted_operations AS (
            UPDATE crm_search_operations operation
            SET confirmation_attempt_count = operation.confirmation_attempt_count + 1,
                updated_at = $1
            FROM claimable
            WHERE operation.id = claimable.operation_id
            RETURNING operation.*
          )
          SELECT operation.id AS operation_id, document.id AS document_id,
                 operation.organisation_scope_id, operation.client_id,
                 operation.entity_type, operation.entity_id, operation.schema_version,
                 CASE
                   WHEN policy.active_schema_version = operation.schema_version THEN 'active'
                   WHEN policy.candidate_schema_version = operation.schema_version THEN 'candidate'
                   ELSE 'retiring'
                 END AS schema_role,
                 operation.source_revision, operation.source_event_sequence,
                 operation.desired_action, operation.vector_id, operation.namespace,
                 operation.confirmation_tag, operation.confirmation_key_version,
                 operation.provider_mutation_id,
                 (SELECT COUNT(*)::INTEGER FROM crm_search_provider_attempts attempt_count
                   WHERE attempt_count.operation_id = operation.id
                     AND attempt_count.provider = 'vectorize') AS provider_attempt_count,
                 operation.confirmation_attempt_count,
                 COALESCE(operation.provider_accepted_at, ambiguous.settled_at,
                   operation.updated_at) + INTERVAL '15 minutes' AS confirmation_deadline_at,
                 ambiguous.id AS ambiguous_attempt_id,
                 document.lease_token, document.lease_generation
          FROM leased_documents document
          JOIN attempted_operations operation
            ON operation.id = (SELECT operation_id FROM claimable
              WHERE document_id = document.id)
          LEFT JOIN crm_search_policies policy
            ON policy.organisation_scope_id = operation.organisation_scope_id
           AND policy.client_id = operation.client_id
          LEFT JOIN LATERAL (
            SELECT attempt.id, attempt.settled_at
            FROM crm_search_provider_attempts attempt
            WHERE attempt.operation_id = operation.id
              AND attempt.provider = 'vectorize'
              AND attempt.state = 'ambiguous'
            ORDER BY attempt.created_at DESC, attempt.id DESC
            LIMIT 1
          ) ambiguous ON TRUE
          ORDER BY document.updated_at, document.id
        `, [input.now, input.limit])
        return claimed.rows.map(mapPendingConfirmation)
      })
    },
    async claimInventoryRepairs(input) {
      const rows = await crmSearchRepositoryDependencies.queryRowsFresh(`
        WITH source_inventory AS (
          SELECT scope.id AS organisation_scope_id, person.client_id,
                 'person'::TEXT AS entity_type, person.id AS entity_id,
                 person.search_revision AS source_revision, person.deleted_at,
                 crm_search_person_projection_hash_v1(
                   person.first_name, person.last_name, person.job_title,
                   person.department, person.custom_fields->>'lifecycle_stage'
                 ) AS content_hash
          FROM crm_people person
          CROSS JOIN crm_search_organisation_scopes scope
          WHERE scope.is_primary = TRUE AND scope.is_active = TRUE
          UNION ALL
          SELECT scope.id, company.client_id, 'company', company.id,
                 company.search_revision, company.deleted_at,
                 crm_search_company_projection_hash_v1(
                   company.name, company.domain, company.custom_fields->>'lifecycle_stage'
                 )
          FROM crm_companies company
          CROSS JOIN crm_search_organisation_scopes scope
          WHERE scope.is_primary = TRUE AND scope.is_active = TRUE
          UNION ALL
          SELECT scope.id, opportunity.client_id, 'opportunity', opportunity.id,
                 opportunity.search_revision, opportunity.deleted_at,
                 crm_search_opportunity_projection_hash_v1(
                   opportunity.name, opportunity.status, opportunity.source
                 )
          FROM crm_opportunities opportunity
          CROSS JOIN crm_search_organisation_scopes scope
          WHERE scope.is_primary = TRUE AND scope.is_active = TRUE
        ), desired_schema AS (
          SELECT policy.organisation_scope_id, policy.client_id,
                 target.schema_version, target.schema_role, namespace.namespace
          FROM crm_search_policies policy
          JOIN crm_search_global_control control
            ON control.organisation_scope_id = policy.organisation_scope_id
          JOIN crm_search_namespaces namespace
            ON namespace.organisation_scope_id = policy.organisation_scope_id
           AND namespace.client_id = policy.client_id
          CROSS JOIN LATERAL (VALUES
            (policy.active_schema_version, 'active'::TEXT),
            (policy.candidate_schema_version, 'candidate'::TEXT)
          ) target(schema_version, schema_role)
          WHERE control.state = 'enabled' AND control.indexing_ready = TRUE
            AND policy.indexing_enabled = TRUE
            AND policy.lifecycle_state IN ('indexing', 'shadow', 'assist')
            AND target.schema_version IS NOT NULL
        ), desired_repairs AS (
          SELECT CASE WHEN document.id IS NULL THEN 'missing' ELSE 'stale' END AS repair_kind,
                 source.organisation_scope_id, source.client_id, source.entity_type,
                 source.entity_id, target.schema_version, target.schema_role,
                 source.source_revision, 'upsert'::TEXT AS desired_action,
                 target.namespace, source.content_hash, document.vector_id
          FROM source_inventory source
          JOIN desired_schema target
            ON target.organisation_scope_id = source.organisation_scope_id
           AND target.client_id = source.client_id
          LEFT JOIN crm_search_documents document
            ON document.organisation_scope_id = source.organisation_scope_id
           AND document.client_id = source.client_id
           AND document.entity_type = source.entity_type
           AND document.entity_id = source.entity_id
           AND document.schema_version = target.schema_version
          LEFT JOIN crm_search_source_dirty dirty
            ON dirty.organisation_scope_id = source.organisation_scope_id
           AND dirty.client_id = source.client_id
           AND dirty.entity_type = source.entity_type
           AND dirty.entity_id = source.entity_id
          WHERE source.deleted_at IS NULL
            AND (document.id IS NULL OR document.tombstoned = TRUE
              OR document.confirmation_state <> 'indexed'
              OR document.source_revision <> source.source_revision
              OR document.content_hash IS DISTINCT FROM source.content_hash)
            AND NOT COALESCE(
              dirty.source_revision >= source.source_revision
                AND dirty.desired_action = 'upsert',
              FALSE
            )
            AND NOT EXISTS (
              SELECT 1 FROM crm_search_operations operation
              WHERE operation.organisation_scope_id = source.organisation_scope_id
                AND operation.client_id = source.client_id
                AND operation.entity_type = source.entity_type
                AND operation.entity_id = source.entity_id
                AND operation.schema_version = target.schema_version
                AND operation.source_revision = source.source_revision
                AND operation.desired_action = 'upsert'
                AND operation.state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter')
            )
        ), orphan_repairs AS (
          SELECT 'orphaned'::TEXT AS repair_kind, document.organisation_scope_id,
                 document.client_id, document.entity_type, document.entity_id,
                 document.schema_version, 'retiring'::TEXT AS schema_role,
                 COALESCE(source.source_revision, document.source_revision) AS source_revision,
                 'delete'::TEXT AS desired_action,
                 document.namespace, NULL::TEXT AS content_hash, document.vector_id
          FROM crm_search_documents document
          LEFT JOIN source_inventory source
            ON source.organisation_scope_id = document.organisation_scope_id
           AND source.client_id = document.client_id
           AND source.entity_type = document.entity_type
           AND source.entity_id = document.entity_id
          LEFT JOIN crm_search_policies policy
            ON policy.organisation_scope_id = document.organisation_scope_id
           AND policy.client_id = document.client_id
          WHERE document.tombstoned = FALSE
            AND document.confirmation_state <> 'deleted'
            AND (source.entity_id IS NULL OR source.deleted_at IS NOT NULL
              OR (document.schema_version IS DISTINCT FROM policy.active_schema_version
                AND document.schema_version IS DISTINCT FROM policy.candidate_schema_version))
            AND NOT EXISTS (
              SELECT 1 FROM crm_search_source_dirty dirty
              WHERE dirty.organisation_scope_id = document.organisation_scope_id
                AND dirty.client_id = document.client_id
                AND dirty.entity_type = document.entity_type
                AND dirty.entity_id = document.entity_id
                AND dirty.source_revision >= document.source_revision
                AND dirty.desired_action = 'delete'
            )
            AND NOT EXISTS (
              SELECT 1 FROM crm_search_schema_retirement_work work
              WHERE work.organisation_scope_id = document.organisation_scope_id
                AND work.client_id = document.client_id
                AND work.schema_version = document.schema_version
                AND work.vector_id = document.vector_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM crm_search_operations operation
              WHERE operation.organisation_scope_id = document.organisation_scope_id
                AND operation.client_id = document.client_id
                AND operation.entity_type = document.entity_type
                AND operation.entity_id = document.entity_id
                AND operation.schema_version = document.schema_version
                AND operation.source_revision = document.source_revision
                AND operation.desired_action = 'delete'
                AND operation.state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter')
            )
        ), retirement_repairs AS (
          SELECT 'retiring'::TEXT AS repair_kind, work.organisation_scope_id,
                 work.client_id, work.entity_type, work.entity_id, work.schema_version,
                 'retiring'::TEXT AS schema_role, work.source_revision,
                 'delete'::TEXT AS desired_action, work.namespace,
                 NULL::TEXT AS content_hash, work.vector_id,
                 CASE WHEN work.state = 'pending'
                   THEN work.source_event_sequence ELSE NULL END AS source_event_sequence
          FROM crm_search_schema_retirement_work work
          WHERE work.state = 'pending'
             OR (work.state = 'operation_created' AND NOT EXISTS (
               SELECT 1 FROM crm_search_operations operation
               WHERE operation.id = work.operation_id
                 AND operation.state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter')
             ))
        )
        SELECT * FROM (
          SELECT desired.*, NULL::BIGINT AS source_event_sequence FROM desired_repairs desired
          UNION ALL SELECT orphaned.*, NULL::BIGINT FROM orphan_repairs orphaned
          UNION ALL SELECT * FROM retirement_repairs
        ) inventory
        ORDER BY repair_kind, organisation_scope_id, client_id, entity_type,
                 entity_id, schema_version
        LIMIT $1
      `, [input.limit])
      const repairs: InventoryRepair[] = []
      for (const row of rows) {
        const organisationScopeId = requireUuid(row.organisation_scope_id,
          'crm_search_invalid_reconciliation')
        const clientId = requireUuid(row.client_id, 'crm_search_invalid_reconciliation')
        const entityType = String(row.entity_type) as CrmSearchEntityType
        const entityId = requireUuid(row.entity_id, 'crm_search_invalid_reconciliation')
        const schemaVersion = requireSchemaVersion(row.schema_version,
          'crm_search_invalid_reconciliation')
        const sourceRevision = requireSafeInteger(row.source_revision,
          'crm_search_invalid_reconciliation', { minimum: 1 })
        const namespace = requireString(row.namespace, 'crm_search_invalid_reconciliation', {
          maximumLength: 64, pattern: providerIdPattern
        })
        const desiredAction = String(row.desired_action) as 'upsert' | 'delete'
        const vectorId = desiredAction === 'upsert'
          ? await deriveCrmSearchVectorId({ organisationScopeId, clientId,
              entityType, entityId, schemaVersion })
          : requireString(row.vector_id, 'crm_search_invalid_reconciliation', {
              maximumLength: 64, pattern: providerIdPattern
            })
        const contentHash = desiredAction === 'upsert'
          ? requireDigest(row.content_hash, 'crm_search_invalid_reconciliation')
          : null
        const confirmation = desiredAction === 'upsert' && confirmationKeyring
          ? await createCrmSearchConfirmationTag({ organisationScopeId, clientId,
              vectorId, schemaVersion, sourceRevision, contentHash: contentHash! }, confirmationKeyring)
          : null
        if (desiredAction === 'upsert' && !confirmation) continue
        repairs.push({
          repairKind: String(row.repair_kind) as InventoryRepair['repairKind'],
          organisationScopeId, clientId, entityType, entityId, schemaVersion,
          schemaRole: String(row.schema_role) as InventoryRepair['schemaRole'],
          sourceRevision,
          ...(row.source_event_sequence == null
            ? {}
            : {
                sourceEventSequence: requireSafeInteger(row.source_event_sequence,
                  'crm_search_invalid_reconciliation', { minimum: 1 })
              }),
          desiredAction, vectorId, namespace, contentHash,
          confirmationTag: confirmation?.confirmationTag ?? null,
          confirmationKeyVersion: confirmation?.confirmationKeyVersion ?? null
        })
      }
      return repairs
    },
    async recoverAmbiguousAcceptance(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        const mutationId = `reconciled:${input.ambiguousAttemptId}`
        const operation = await transaction.query(`
          UPDATE crm_search_operations
          SET state = 'provider_pending', provider_mutation_id = $4,
              provider_accepted_at = $5, provider_attempt_count = provider_attempt_count + 1,
              updated_at = $5
          WHERE id = $1 AND state = 'admitted'
            AND lease_token = $2 AND lease_generation = $3
          RETURNING id
        `, [input.operationId, input.leaseToken, input.leaseGeneration,
          mutationId, input.recoveredAt])
        const document = await transaction.query(`
          UPDATE crm_search_documents
          SET provider_mutation_id = $4, updated_at = $5
          WHERE id = $1 AND lease_token = $2 AND lease_generation = $3
          RETURNING id
        `, [input.documentId, input.leaseToken, input.leaseGeneration,
          mutationId, input.recoveredAt])
        return affectedRows(operation) === 1 && affectedRows(document) === 1
      })
    },
    async confirmIndexed(input) {
      return confirmPending(input, 'provider_pending', 'indexed')
    },
    async confirmDeleted(input) {
      return confirmPending(input, 'delete_pending', 'deleted')
    },
    async rescheduleConfirmation(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        const document = await transaction.query(`
          UPDATE crm_search_documents
          SET lease_token = NULL, lease_expires_at = NULL, updated_at = $4
          WHERE id = $1 AND lease_token = $2 AND lease_generation = $3
          RETURNING id
        `, [input.documentId, input.leaseToken, input.leaseGeneration, input.attemptedAt])
        const operation = await transaction.query(`
          UPDATE crm_search_operations
          SET error_class = $2, next_attempt_at = $3, updated_at = $4
          WHERE id = $1 AND state IN ('admitted', 'provider_pending')
          RETURNING id
        `, [input.operationId, input.errorClass, input.nextAttemptAt, input.attemptedAt])
        return affectedRows(document) === 1 && affectedRows(operation) === 1
      })
    },
    async recordConfirmationDeadLetter(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        const operation = await transaction.query(`
          INSERT INTO crm_search_dead_letters (
            organisation_scope_id, client_id, operation_id, origin,
            attempts, error_class, first_failed_at, last_failed_at
          ) VALUES ($1, $2, $3, 'provider_confirmation', $4,
            'confirmation_exhausted', $5, $5)
          ON CONFLICT (operation_id) DO NOTHING
          RETURNING id
        `, [input.organisationScopeId, input.clientId, input.operationId,
          input.attempts, input.failedAt])
        if (affectedRows(operation) !== 1) return false
        const terminal = await transaction.query(`
          UPDATE crm_search_operations
          SET state = 'terminal_dead_letter', error_class = 'confirmation_exhausted',
              lease_token = NULL, lease_expires_at = NULL, updated_at = $2
          WHERE id = $1 AND state IN ('admitted', 'provider_pending')
          RETURNING id
        `, [input.operationId, input.failedAt])
        const document = await transaction.query(`
          UPDATE crm_search_documents
          SET confirmation_state = 'error', lease_token = NULL,
              lease_expires_at = NULL, updated_at = $4
          WHERE id = $1 AND lease_token = $2 AND lease_generation = $3
          RETURNING id
        `, [input.documentId, input.leaseToken, input.leaseGeneration, input.failedAt])
        return affectedRows(terminal) === 1 && affectedRows(document) === 1
      })
    },
    async createRepairOperation(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        await transaction.query(`
          SELECT pg_advisory_xact_lock_shared(
            crm_search_client_advisory_lock_key($1, $2)
          )
        `, [input.organisationScopeId, input.clientId])
        const authority = firstRow(await transaction.query(`
          SELECT control.state, control.indexing_ready,
                 policy.lifecycle_state, policy.indexing_enabled,
                 policy.active_schema_version, policy.candidate_schema_version,
                 policy.retiring_schema_versions, namespace.namespace
          FROM crm_search_global_control control
          JOIN crm_search_policies policy
            ON policy.organisation_scope_id = control.organisation_scope_id
           AND policy.client_id = $2
          JOIN crm_search_namespaces namespace
            ON namespace.organisation_scope_id = control.organisation_scope_id
           AND namespace.client_id = $2
          WHERE control.organisation_scope_id = $1
          FOR SHARE OF control, policy, namespace
        `, [input.organisationScopeId, input.clientId]))
        if (!authority || !['enabled', 'delete_only'].includes(String(authority.state))
          || authority.namespace !== input.namespace) return false
        const document = firstRow(await transaction.query(`
          SELECT source_revision, vector_id
          FROM crm_search_documents
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
          FOR SHARE
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion]))
        const retirement = firstRow(await transaction.query(`
          SELECT state
          FROM crm_search_schema_retirement_work
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
            AND vector_id = $6
          FOR SHARE
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion, input.vectorId]))
        const table = input.entityType === 'person'
          ? 'crm_people'
          : input.entityType === 'company' ? 'crm_companies' : 'crm_opportunities'
        const hash = input.entityType === 'person'
          ? `crm_search_person_projection_hash_v1(first_name, last_name, job_title,
              department, custom_fields->>'lifecycle_stage')`
          : input.entityType === 'company'
            ? `crm_search_company_projection_hash_v1(
                name, domain, custom_fields->>'lifecycle_stage')`
            : 'crm_search_opportunity_projection_hash_v1(name, status, source)'
        const source = firstRow(await transaction.query(`
          SELECT client_id, search_revision, deleted_at, ${hash} AS content_hash
          FROM ${table}
          WHERE id = $1
          FOR SHARE
        `, [input.entityId]))
        if (input.desiredAction === 'upsert') {
          if (authority.state !== 'enabled' || authority.indexing_ready !== true
            || authority.indexing_enabled !== true
            || !['indexing', 'shadow', 'assist'].includes(String(authority.lifecycle_state))
            || ![authority.active_schema_version, authority.candidate_schema_version]
              .includes(input.schemaVersion)) return false
          if (!source || source.deleted_at !== null
            || source.client_id !== input.clientId
            || Number(source.search_revision) !== input.sourceRevision
            || source.content_hash !== input.contentHash) return false
        } else {
          if (authority.state !== 'enabled' || authority.indexing_ready !== true
            || authority.indexing_enabled !== true
            || !['indexing', 'shadow', 'assist'].includes(String(authority.lifecycle_state))) {
            return false
          }
          const policySchemas = [authority.active_schema_version,
            authority.candidate_schema_version,
            ...(Array.isArray(authority.retiring_schema_versions)
              ? authority.retiring_schema_versions
              : [])]
          const hasRetirementAuthority = ['pending', 'operation_created']
            .includes(String(retirement?.state))
          if (document?.vector_id !== input.vectorId
            && !hasRetirementAuthority) return false
          if (!hasRetirementAuthority
            && !policySchemas.includes(input.schemaVersion)) return false
          const retiring = ![authority.active_schema_version, authority.candidate_schema_version]
            .includes(input.schemaVersion)
          if (!hasRetirementAuthority && source
            && source.deleted_at === null && source.client_id === input.clientId
            && !retiring) return false
        }
        const sequence = input.sourceEventSequence === undefined
          ? firstRow(await transaction.query(`
              SELECT nextval('crm_search_source_event_sequence') AS event_sequence
            `))
          : { event_sequence: input.sourceEventSequence }
        const operation = await upsertCrmSearchOperation({
          organisationScopeId: input.organisationScopeId,
          clientId: input.clientId,
          entityType: input.entityType,
          entityId: input.entityId,
          schemaVersion: input.schemaVersion,
          sourceRevision: input.sourceRevision,
          sourceEventSequence: requireSafeInteger(sequence?.event_sequence,
            'crm_search_invalid_reconciliation', { minimum: 1 }),
          desiredAction: input.desiredAction,
          vectorId: input.vectorId,
          namespace: input.namespace,
          contentHash: input.contentHash,
          confirmationTag: input.confirmationTag,
          confirmationKeyVersion: input.confirmationKeyVersion
        }, transaction)
        if (input.repairKind === 'retiring') {
          const linked = await transaction.query(`
            UPDATE crm_search_schema_retirement_work
            SET state = 'operation_created', operation_id = $6, updated_at = $7
            WHERE organisation_scope_id = $1 AND client_id = $2
              AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
              AND vector_id = $8 AND state IN ('pending', 'operation_created')
            RETURNING id
          `, [input.organisationScopeId, input.clientId, input.entityType,
            input.entityId, input.schemaVersion, operation.id, input.repairedAt,
            input.vectorId])
          if (affectedRows(linked) !== 1) return false
        }
        return true
      })
    },
    async resolveRepairEvidence(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        await transaction.query(`
          SELECT pg_advisory_xact_lock_shared(
            crm_search_client_advisory_lock_key($1, $2)
          )
        `, [input.organisationScopeId, input.clientId])
        const authority = firstRow(await transaction.query(`
          SELECT control.state, control.indexing_ready,
                 policy.lifecycle_state, policy.indexing_enabled,
                 policy.active_schema_version, policy.candidate_schema_version,
                 policy.retiring_schema_versions, namespace.namespace
          FROM crm_search_global_control control
          JOIN crm_search_policies policy
            ON policy.organisation_scope_id = control.organisation_scope_id
           AND policy.client_id = $2
          JOIN crm_search_namespaces namespace
            ON namespace.organisation_scope_id = control.organisation_scope_id
           AND namespace.client_id = $2
          WHERE control.organisation_scope_id = $1
          FOR SHARE OF control, policy, namespace
        `, [input.organisationScopeId, input.clientId]))
        if (!authority || !['enabled', 'delete_only'].includes(String(authority.state))
          || authority.namespace !== input.namespace) return false
        const documentAuthority = firstRow(await transaction.query(`
          SELECT vector_id
          FROM crm_search_documents
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
          FOR SHARE
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion]))
        const retirementAuthority = firstRow(await transaction.query(`
          SELECT state
          FROM crm_search_schema_retirement_work
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
            AND vector_id = $6
          FOR SHARE
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion, input.vectorId]))
        const table = input.entityType === 'person'
          ? 'crm_people'
          : input.entityType === 'company' ? 'crm_companies' : 'crm_opportunities'
        const hash = input.entityType === 'person'
          ? `crm_search_person_projection_hash_v1(first_name, last_name, job_title,
              department, custom_fields->>'lifecycle_stage')`
          : input.entityType === 'company'
            ? `crm_search_company_projection_hash_v1(
                name, domain, custom_fields->>'lifecycle_stage')`
            : 'crm_search_opportunity_projection_hash_v1(name, status, source)'
        const source = firstRow(await transaction.query(`
          SELECT client_id, search_revision, deleted_at, ${hash} AS content_hash
          FROM ${table}
          WHERE id = $1
          FOR SHARE
        `, [input.entityId]))
        if (input.desiredAction === 'upsert') {
          if (authority.state !== 'enabled' || authority.indexing_ready !== true
            || authority.indexing_enabled !== true
            || !['indexing', 'shadow', 'assist'].includes(String(authority.lifecycle_state))
            || ![authority.active_schema_version, authority.candidate_schema_version]
              .includes(input.schemaVersion)
              || !source || source.deleted_at !== null || source.client_id !== input.clientId
              || Number(source.search_revision) !== input.sourceRevision
              || source.content_hash !== input.contentHash) return false
          const sequence = firstRow(await transaction.query(`
            SELECT nextval('crm_search_source_event_sequence') AS event_sequence
          `))
          const stored = await transaction.query(`
            INSERT INTO crm_search_documents (
              organisation_scope_id, client_id, entity_type, entity_id,
              schema_version, vector_id, namespace, source_revision,
              source_event_sequence, content_hash, confirmation_state, tombstoned,
              confirmation_tag, confirmation_key_version, last_confirmed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              'indexed', FALSE, $11, $12, $13)
            ON CONFLICT (organisation_scope_id, client_id, entity_type, entity_id, schema_version)
            DO UPDATE SET vector_id = EXCLUDED.vector_id, namespace = EXCLUDED.namespace,
              source_revision = EXCLUDED.source_revision,
              source_event_sequence = EXCLUDED.source_event_sequence,
              content_hash = EXCLUDED.content_hash, confirmation_state = 'indexed',
              tombstoned = FALSE, confirmation_tag = EXCLUDED.confirmation_tag,
              confirmation_key_version = EXCLUDED.confirmation_key_version,
              last_confirmed_at = EXCLUDED.last_confirmed_at,
              provider_high_watermark = GREATEST(
                crm_search_documents.provider_high_watermark,
                EXCLUDED.source_event_sequence
              ), updated_at = EXCLUDED.last_confirmed_at
            WHERE crm_search_documents.source_revision <= EXCLUDED.source_revision
            RETURNING id
          `, [input.organisationScopeId, input.clientId, input.entityType,
            input.entityId, input.schemaVersion, input.vectorId, input.namespace,
            input.sourceRevision, requireSafeInteger(sequence?.event_sequence,
              'crm_search_invalid_reconciliation', { minimum: 1 }), input.contentHash,
            input.confirmationTag, input.confirmationKeyVersion, input.confirmedAt])
          return affectedRows(stored) === 1
        }
        const hasRetirementAuthority = ['pending', 'operation_created']
          .includes(String(retirementAuthority?.state))
        const retiring = ![authority.active_schema_version, authority.candidate_schema_version]
          .includes(input.schemaVersion)
        if (authority.state !== 'enabled' || authority.indexing_ready !== true
          || authority.indexing_enabled !== true
          || !['indexing', 'shadow', 'assist'].includes(String(authority.lifecycle_state))) {
          return false
        }
        if (documentAuthority?.vector_id !== input.vectorId && !hasRetirementAuthority) return false
        if (!hasRetirementAuthority && source && source.deleted_at === null
          && source.client_id === input.clientId && !retiring) return false
        const deleteSequence = input.sourceEventSequence === undefined
          ? firstRow(await transaction.query(`
              SELECT nextval('crm_search_source_event_sequence') AS event_sequence
            `))
          : { event_sequence: input.sourceEventSequence }
        const sourceEventSequence = requireSafeInteger(deleteSequence?.event_sequence,
          'crm_search_invalid_reconciliation', { minimum: 1 })
        const document = await transaction.query(`
          UPDATE crm_search_documents
          SET confirmation_state = 'deleted', tombstoned = TRUE,
              source_revision = GREATEST(source_revision, $8),
              source_event_sequence = GREATEST(source_event_sequence, $9),
              provider_high_watermark = GREATEST(provider_high_watermark, $9),
              last_confirmed_at = $7, updated_at = $7
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
            AND vector_id = $6 AND confirmation_state <> 'deleted'
          RETURNING id
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion, input.vectorId, input.confirmedAt,
          input.sourceRevision, sourceEventSequence])
        const retirement = await transaction.query(`
          UPDATE crm_search_schema_retirement_work
          SET state = 'confirmed_absent', confirmed_absent_at = $7, updated_at = $7
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
            AND vector_id = $6 AND state <> 'confirmed_absent'
          RETURNING id
        `, [input.organisationScopeId, input.clientId, input.entityType,
          input.entityId, input.schemaVersion, input.vectorId, input.confirmedAt])
        return affectedRows(document) === 1 || affectedRows(retirement) === 1
      })
    },
    async schedulePendingTeardowns(input) {
      return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
        const completed = await transaction.query(`
          WITH eligible AS (
            SELECT teardown.id, teardown.organisation_scope_id,
                   teardown.client_id, teardown.namespace
            FROM crm_search_client_teardowns teardown
            WHERE teardown.state IN ('deleting', 'provider_pending')
              AND teardown.provider_deletion_state = 'confirmed_absent'
              AND NOT EXISTS (
                SELECT 1 FROM crm_search_teardown_vectors vector
                WHERE vector.teardown_id = teardown.id
                  AND vector.deletion_state <> 'confirmed_absent'
              )
            ORDER BY teardown.updated_at, teardown.id
            LIMIT $1
            FOR UPDATE OF teardown SKIP LOCKED
          ), confirmed AS (
            UPDATE crm_search_client_teardowns teardown
            SET state = 'confirmed', completed_at = $2, updated_at = $2
            FROM eligible WHERE teardown.id = eligible.id
            RETURNING eligible.*
          )
          UPDATE crm_search_namespaces namespace
          SET state = 'provider_confirmed_empty', provider_confirmed_empty_at = $2,
              updated_at = $2
          FROM confirmed
          WHERE namespace.organisation_scope_id = confirmed.organisation_scope_id
            AND namespace.client_id = confirmed.client_id
            AND namespace.namespace = confirmed.namespace
          RETURNING confirmed.id
        `, [input.limit, input.now])
        const claims = await transaction.query(`
          SELECT vector.*, teardown.state AS teardown_state
          FROM crm_search_teardown_vectors vector
          JOIN crm_search_client_teardowns teardown ON teardown.id = vector.teardown_id
          WHERE (vector.deletion_state IN ('pending', 'failed') OR (
              vector.deletion_state = 'provider_pending'
              AND NOT EXISTS (
                SELECT 1 FROM crm_search_operations operation
                WHERE operation.organisation_scope_id = vector.organisation_scope_id
                  AND operation.client_id = vector.client_id
                  AND operation.entity_type = vector.entity_type
                  AND operation.entity_id = vector.entity_id
                  AND operation.schema_version = vector.schema_version
                  AND operation.vector_id = vector.vector_id
                  AND operation.desired_action = 'delete'
                  AND operation.state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter')
              )
            ))
            AND teardown.state IN ('pending', 'deleting', 'provider_pending', 'failed')
          ORDER BY vector.updated_at, vector.id
          LIMIT $1
          FOR UPDATE OF vector, teardown SKIP LOCKED
        `, [input.limit])
        let scheduled = 0
        for (const row of claims.rows) {
          await transaction.query(`
            SELECT pg_advisory_xact_lock_shared(
              crm_search_client_advisory_lock_key($1, $2)
            )
          `, [row.organisation_scope_id, row.client_id])
          const sequence = firstRow(await transaction.query(`
            SELECT nextval('crm_search_source_event_sequence') AS event_sequence
          `))
          await upsertCrmSearchOperation({
            organisationScopeId: requireUuid(row.organisation_scope_id,
              'crm_search_invalid_reconciliation'),
            clientId: requireUuid(row.client_id, 'crm_search_invalid_reconciliation'),
            entityType: String(row.entity_type) as CrmSearchEntityType,
            entityId: requireUuid(row.entity_id, 'crm_search_invalid_reconciliation'),
            schemaVersion: requireSchemaVersion(row.schema_version,
              'crm_search_invalid_reconciliation'),
            sourceRevision: requireSafeInteger(row.source_revision,
              'crm_search_invalid_reconciliation', { minimum: 1 }),
            sourceEventSequence: requireSafeInteger(sequence?.event_sequence,
              'crm_search_invalid_reconciliation', { minimum: 1 }),
            desiredAction: 'delete',
            vectorId: requireString(row.vector_id, 'crm_search_invalid_reconciliation', {
              maximumLength: 64, pattern: providerIdPattern
            }),
            namespace: requireString(row.namespace, 'crm_search_invalid_reconciliation', {
              maximumLength: 64, pattern: providerIdPattern
            }),
            contentHash: null,
            confirmationTag: null,
            confirmationKeyVersion: null
          }, transaction)
          await transaction.query(`
            UPDATE crm_search_teardown_vectors
            SET deletion_state = 'provider_pending', attempt_count = attempt_count + 1,
                updated_at = $2
            WHERE id = $1 AND deletion_state IN ('pending', 'provider_pending', 'failed')
          `, [row.id, input.now])
          await transaction.query(`
            UPDATE crm_search_client_teardowns
            SET state = 'deleting', provider_deletion_state = 'pending', updated_at = $2
            WHERE id = $1 AND state IN ('pending', 'failed')
          `, [row.teardown_id, input.now])
          scheduled += 1
        }
        return { scheduled, finalized: affectedRows(completed) }
      })
    }
  }
}

async function confirmPending(
  input: ConfirmationMutationInput,
  expectedState: 'provider_pending' | 'delete_pending',
  nextState: 'indexed' | 'deleted'
): Promise<boolean> {
  return crmSearchRepositoryDependencies.transactionWithoutRetry(async (transaction) => {
    const document = await transaction.query(`
      UPDATE crm_search_documents
      SET confirmation_state = $4, tombstoned = ($4 = 'deleted'),
          provider_high_watermark = GREATEST(provider_high_watermark, $5),
          last_confirmed_at = $6, lease_token = NULL, lease_expires_at = NULL,
          updated_at = $6
      WHERE id = $1 AND lease_token = $2 AND lease_generation = $3
        AND confirmation_state = $7 AND source_revision = $8
      RETURNING id
    `, [input.documentId, input.leaseToken, input.leaseGeneration, nextState,
      input.sourceEventSequence, input.confirmedAt, expectedState, input.sourceRevision])
    const operation = await transaction.query(`
      UPDATE crm_search_operations
      SET state = 'confirmed', confirmed_at = $2,
          lease_token = NULL, lease_expires_at = NULL, updated_at = $2
      WHERE id = $1 AND state = 'provider_pending'
      RETURNING id
    `, [input.operationId, input.confirmedAt])
    if (affectedRows(document) !== 1 || affectedRows(operation) !== 1) return false
    if (nextState === 'deleted') {
      await transaction.query(`
        WITH confirmed AS (
          UPDATE crm_search_teardown_vectors vector
          SET deletion_state = 'confirmed_absent',
              provider_mutation_id = $7,
              confirmed_absent_at = $8, last_error_class = NULL, updated_at = $8
          FROM crm_search_client_teardowns teardown
          WHERE vector.teardown_id = teardown.id
            AND vector.organisation_scope_id = $1 AND vector.client_id = $2
            AND vector.entity_type = $3 AND vector.entity_id = $4
            AND vector.schema_version = $5 AND vector.vector_id = $6
            AND vector.deletion_state IN ('pending', 'provider_pending', 'failed')
            AND teardown.state IN ('deleting', 'provider_pending')
          RETURNING vector.teardown_id
        )
        UPDATE crm_search_client_teardowns teardown
        SET state = 'provider_pending',
            provider_deletion_state = CASE WHEN NOT EXISTS (
              SELECT 1 FROM crm_search_teardown_vectors remaining
              WHERE remaining.teardown_id = teardown.id
                AND remaining.deletion_state <> 'confirmed_absent'
            ) THEN 'confirmed_absent' ELSE 'partially_confirmed' END,
            updated_at = $8
        WHERE teardown.id IN (SELECT teardown_id FROM confirmed)
      `, [input.organisationScopeId, input.clientId, input.entityType,
        input.entityId, input.schemaVersion, input.vectorId,
        input.providerMutationId, input.confirmedAt])
      await transaction.query(`
        UPDATE crm_search_schema_retirement_work
        SET state = 'confirmed_absent', confirmed_absent_at = $7, updated_at = $7
        WHERE organisation_scope_id = $1 AND client_id = $2
          AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
          AND vector_id = $6 AND state <> 'confirmed_absent'
      `, [input.organisationScopeId, input.clientId, input.entityType,
        input.entityId, input.schemaVersion, input.vectorId, input.confirmedAt])
    }
    return true
  })
}

export async function reconcileCrmSearchIndexRequest(
  event: unknown,
  input: ReconcileCrmSearchIndexInput
): Promise<Omit<CrmSearchReconciliationResult, 'repairsCreated'>> {
  const runtime = resolveCrmSearchProviderRuntime(event)
  if (!runtime) throw crmSearchRepositoryError('crm_search_reconciliation_runtime_unavailable')
  const result = await reconcileCrmSearchIndex(
    input,
    { vectorize: runtime.vectorize },
    createDefaultCrmSearchReconciliationDependencies(
      resolveCrmSearchConfirmationKeyring(event as never)
    )
  )
  const {
    repairsCreated: _repairsCreated,
    teardownsScheduled: _teardownsScheduled,
    teardownsFinalized: _teardownsFinalized,
    ...safe
  } = result
  return safe
}
