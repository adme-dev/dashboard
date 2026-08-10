import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './contracts'
import {
  confirmStoredCrmSearchVector,
  resolveCrmSearchProviderRuntime,
  type CrmSearchStoredVector
} from './provider'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  requireSafeInteger,
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

export interface CrmSearchReconciliationDependencies {
  claimPendingConfirmations(input: ReconcileCrmSearchIndexInput): Promise<PendingConfirmation[]>
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
  createRepairOperation(input: unknown): Promise<boolean>
}

export interface CrmSearchReconciliationResult {
  claimed: number
  indexed: number
  deleted: number
  rescheduled: number
  deadLettered: number
  repairsCreated: number
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
): Promise<CrmSearchReconciliationResult> {
  if (!input || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25
    || !timestamp(input.now) || !runtime?.vectorize || !dependencies) fail()
  const claims = await dependencies.claimPendingConfirmations({ ...input })
  if (!Array.isArray(claims) || claims.length > input.limit) fail()
  const result: CrmSearchReconciliationResult = {
    claimed: claims.length,
    indexed: 0,
    deleted: 0,
    rescheduled: 0,
    deadLettered: 0,
    repairsCreated: 0
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

export function createDefaultCrmSearchReconciliationDependencies(): CrmSearchReconciliationDependencies {
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
    async createRepairOperation() {
      return false
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
    return affectedRows(document) === 1 && affectedRows(operation) === 1
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
    createDefaultCrmSearchReconciliationDependencies()
  )
  const { repairsCreated: _repairsCreated, ...safe } = result
  return safe
}
