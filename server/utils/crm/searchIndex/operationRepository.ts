import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_PROVIDER_ACTIONS,
  type CrmSearchEntityType,
  type CrmSearchProviderAction
} from './contracts'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  isNewerIntent,
  requireBoundedClass,
  requireDigest,
  requireEnum,
  requireHmacDigest,
  requireOptionalTimestamp,
  requireOptionalUuid,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchQueryResult,
  type CrmSearchQueryOneFresh,
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_invalid_operation'
const operationStates = [
  'pending_transport', 'queued', 'processing', 'admitted', 'provider_pending',
  'retryable', 'confirmed', 'superseded', 'terminal_dead_letter'
] as const
type OperationState = typeof operationStates[number]
const providerAttemptProviders = ['workers_ai', 'vectorize'] as const
const providerAttemptUsageKinds = ['query', 'indexing'] as const
const providerAttemptActions = ['embedding', 'query', 'upsert', 'delete'] as const
const providerAttemptStates = ['precommitted', 'sent', 'released', 'settled', 'accepted', 'ambiguous'] as const

interface OperationRow extends Record<string, unknown> {
  id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  entity_type: unknown
  entity_id: unknown
  schema_version: unknown
  source_revision: unknown
  source_event_sequence: unknown
  desired_action: unknown
  vector_id: unknown
  namespace: unknown
  content_hash: unknown
  confirmation_tag: unknown
  confirmation_key_version: unknown
  control_revision: unknown
  state: unknown
  successor_of: unknown
  lease_token: unknown
  lease_generation: unknown
  lease_expires_at: unknown
  provider_admitted_at: unknown
  provider_mutation_id: unknown
  provider_accepted_at: unknown
}

export interface CrmSearchOperation {
  id: string
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  sourceRevision: number
  sourceEventSequence: number
  desiredAction: CrmSearchProviderAction
  vectorId: string
  namespace: string
  contentHash: string | null
  confirmationTag: string | null
  confirmationKeyVersion: string | null
  controlRevision: number
  state: OperationState
  successorOf: string | null
  leaseToken: string | null
  leaseGeneration: number
  leaseExpiresAt: string | null
  providerAdmittedAt: string | null
  providerMutationId: string | null
  providerAcceptedAt: string | null
}

export interface UpsertCrmSearchOperationInput {
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  schemaVersion: string
  sourceRevision: number
  sourceEventSequence: number
  desiredAction: CrmSearchProviderAction
  vectorId: string
  namespace: string
  contentHash: string | null
  confirmationTag: string | null
  confirmationKeyVersion: string | null
}

function requireProviderId(value: unknown): string {
  return requireString(value, errorCode, { maximumLength: 64, pattern: /^[A-Za-z0-9_-]+$/ })
}

function optionalString(value: unknown, maximumLength: number): string | null {
  if (value === null || value === undefined) return null
  return requireString(value, errorCode, { maximumLength })
}

function validateUpsertInput(input: UpsertCrmSearchOperationInput): UpsertCrmSearchOperationInput {
  const validated = {
    organisationScopeId: requireUuid(input.organisationScopeId, errorCode),
    clientId: requireUuid(input.clientId, errorCode),
    entityType: requireEnum(input.entityType, CRM_SEARCH_ENTITY_TYPES, errorCode),
    entityId: requireUuid(input.entityId, errorCode),
    schemaVersion: requireSchemaVersion(input.schemaVersion, errorCode),
    sourceRevision: requireSafeInteger(input.sourceRevision, errorCode, { minimum: 1 }),
    sourceEventSequence: requireSafeInteger(input.sourceEventSequence, errorCode, { minimum: 1 }),
    desiredAction: requireEnum(input.desiredAction, CRM_SEARCH_PROVIDER_ACTIONS, errorCode),
    vectorId: requireProviderId(input.vectorId),
    namespace: requireProviderId(input.namespace),
    contentHash: input.contentHash === null ? null : requireDigest(input.contentHash, errorCode),
    confirmationTag: input.confirmationTag === null
      ? null
      : requireHmacDigest(input.confirmationTag, errorCode),
    confirmationKeyVersion: input.confirmationKeyVersion === null
      ? null
      : requireString(input.confirmationKeyVersion, errorCode, {
          maximumLength: 80,
          pattern: /^[A-Za-z0-9._:-]+$/
        })
  }
  if (validated.desiredAction === 'upsert'
    && (!validated.contentHash || !validated.confirmationTag || !validated.confirmationKeyVersion)) {
    throw crmSearchRepositoryError(errorCode)
  }
  if (validated.desiredAction === 'delete' && validated.contentHash !== null) {
    throw crmSearchRepositoryError(errorCode)
  }
  return validated
}

function mapOperation(row: OperationRow): CrmSearchOperation {
  return {
    id: requireUuid(row.id, errorCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, errorCode),
    clientId: requireUuid(row.client_id, errorCode),
    entityType: requireEnum(row.entity_type, CRM_SEARCH_ENTITY_TYPES, errorCode),
    entityId: requireUuid(row.entity_id, errorCode),
    schemaVersion: requireSchemaVersion(row.schema_version, errorCode),
    sourceRevision: requireSafeInteger(row.source_revision, errorCode, { minimum: 1 }),
    sourceEventSequence: requireSafeInteger(row.source_event_sequence, errorCode, { minimum: 1 }),
    desiredAction: requireEnum(row.desired_action, CRM_SEARCH_PROVIDER_ACTIONS, errorCode),
    vectorId: requireProviderId(row.vector_id),
    namespace: requireProviderId(row.namespace),
    contentHash: row.content_hash === null ? null : requireDigest(row.content_hash, errorCode),
    confirmationTag: row.confirmation_tag === null ? null : requireHmacDigest(row.confirmation_tag, errorCode),
    confirmationKeyVersion: optionalString(row.confirmation_key_version, 80),
    controlRevision: requireSafeInteger(row.control_revision, errorCode),
    state: requireEnum(row.state, operationStates, errorCode),
    successorOf: requireOptionalUuid(row.successor_of, errorCode),
    leaseToken: requireOptionalUuid(row.lease_token, errorCode),
    leaseGeneration: requireSafeInteger(row.lease_generation, errorCode),
    leaseExpiresAt: requireOptionalTimestamp(row.lease_expires_at, errorCode),
    providerAdmittedAt: requireOptionalTimestamp(row.provider_admitted_at, errorCode),
    providerMutationId: optionalString(row.provider_mutation_id, 256),
    providerAcceptedAt: requireOptionalTimestamp(row.provider_accepted_at, errorCode)
  }
}

const intentColumns = `
  source_revision = $1,
  source_event_sequence = $2,
  desired_action = $3,
  vector_id = $4,
  namespace = $5,
  content_hash = $6,
  confirmation_tag = $7,
  confirmation_key_version = $8,
  state = CASE state
    WHEN 'pending_transport' THEN 'pending_transport'
    ELSE 'retryable'
  END,
  lease_token = NULL,
  lease_expires_at = NULL,
  error_class = NULL,
  next_attempt_at = NOW(),
  updated_at = NOW()
`

function intentParams(input: UpsertCrmSearchOperationInput): unknown[] {
  return [input.organisationScopeId, input.clientId, input.entityType, input.entityId,
    input.schemaVersion, input.sourceRevision, input.sourceEventSequence, input.desiredAction,
    input.vectorId, input.namespace, input.contentHash, input.confirmationTag,
    input.confirmationKeyVersion]
}

export async function upsertCrmSearchOperation(
  rawInput: UpsertCrmSearchOperationInput,
  transaction: CrmSearchTransactionClient
): Promise<CrmSearchOperation> {
  const input = validateUpsertInput(rawInput)
  const currentRows = (await transaction.query<OperationRow>(`
    SELECT * FROM crm_search_operations
    WHERE organisation_scope_id = $1 AND client_id = $2
      AND entity_type = $3 AND entity_id = $4 AND schema_version = $5
      AND (
        state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter')
        OR (source_revision = $6 AND source_event_sequence = $7 AND desired_action = $8)
      )
    ORDER BY successor_of NULLS FIRST, created_at, id
    FOR UPDATE
  `, intentParams(input).slice(0, 8))).rows.map(mapOperation)

  const exactTerminal = currentRows.find(row =>
    ['confirmed', 'superseded', 'terminal_dead_letter'].includes(row.state)
    && row.sourceRevision === input.sourceRevision
    && row.sourceEventSequence === input.sourceEventSequence
    && row.desiredAction === input.desiredAction)
  if (exactTerminal) return exactTerminal

  const inflight = currentRows.find(row => row.providerAdmittedAt !== null
    && !['confirmed', 'superseded', 'terminal_dead_letter'].includes(row.state))
  const root = currentRows.find(row => row.successorOf === null && row.providerAdmittedAt === null)
  const successor = inflight
    ? currentRows.find(row => row.successorOf === inflight.id && row.providerAdmittedAt === null)
    : undefined
  const replaceable = inflight ? successor : root
  if (replaceable && !isNewerIntent(
    input.sourceRevision,
    input.sourceEventSequence,
    replaceable.sourceRevision,
    replaceable.sourceEventSequence
  )) return replaceable

  let result: CrmSearchQueryResult<OperationRow>
  if (replaceable) {
    result = await transaction.query<OperationRow>(`
      UPDATE crm_search_operations
      SET ${intentColumns},
          successor_of = $9
      WHERE id = $10
        AND ${inflight ? 'successor_of = $9' : 'successor_of IS NULL'}
        AND provider_admitted_at IS NULL
      RETURNING *
    `, [input.sourceRevision, input.sourceEventSequence, input.desiredAction,
      input.vectorId, input.namespace, input.contentHash, input.confirmationTag,
      input.confirmationKeyVersion, inflight?.id ?? null, replaceable.id])
  } else {
    result = await transaction.query<OperationRow>(`
      INSERT INTO crm_search_operations (
        organisation_scope_id, client_id, entity_type, entity_id, schema_version,
        source_revision, source_event_sequence, desired_action, vector_id, namespace,
        content_hash, confirmation_tag, confirmation_key_version, successor_of,
        state, next_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        'pending_transport', NOW())
      RETURNING *
    `, [...intentParams(input), inflight?.id ?? null])
  }
  const stored = firstRow(result)
  if (!stored) throw crmSearchRepositoryError('crm_search_operation_conflict')
  return mapOperation(stored)
}

export interface ClaimCrmSearchOperationsInput {
  limit: number
  leaseSeconds: number
  now: string
}

export interface ClaimCrmSearchOperationInput {
  operationId: string
  leaseSeconds: number
  now: string
}

export interface OperationRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

export async function claimCrmSearchOperation(
  input: ClaimCrmSearchOperationInput,
  dependencies: OperationRepositoryDependencies = {}
): Promise<CrmSearchOperation | null> {
  const operationId = requireUuid(input.operationId, errorCode)
  const leaseSeconds = requireSafeInteger(input.leaseSeconds, errorCode, { minimum: 1, maximum: 900 })
  const now = requireTimestamp(input.now, errorCode)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    await transaction.query(`
      UPDATE crm_search_operations
      SET state = 'queued',
          transport_attempt_count = transport_attempt_count + 1,
          updated_at = $2
      WHERE id = $1
        AND state = 'pending_transport'
        AND next_attempt_at <= $2
        AND lease_token IS NULL
    `, [operationId, now])
    const row = firstRow<OperationRow>(await transaction.query<OperationRow>(`
      UPDATE crm_search_operations operation
      SET state = 'processing',
          lease_token = gen_random_uuid(),
          lease_generation = operation.lease_generation + 1,
          lease_expires_at = $2::TIMESTAMPTZ + ($3 * INTERVAL '1 second'),
          processing_attempt_count = operation.processing_attempt_count + 1,
          updated_at = $2
      WHERE operation.id = $1
        AND operation.state IN ('queued', 'retryable')
        AND operation.next_attempt_at <= $2
        AND (operation.lease_expires_at IS NULL OR operation.lease_expires_at <= $2)
      RETURNING operation.*
    `, [operationId, now, leaseSeconds]))
    return row ? mapOperation(row) : null
  })
}

interface ProviderAttemptRow extends Record<string, unknown> {
  id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  usage_kind: unknown
  operation_id: unknown
  correlation_id: unknown
  provider: unknown
  provider_action: unknown
  attempt_sequence: unknown
  control_revision: unknown
  policy_revision: unknown
  lease_generation: unknown
  state: unknown
  provider_call_sent: unknown
  provider_mutation_id: unknown
  usage_reservation_id: unknown
}

export interface CrmSearchProviderAttempt {
  id: string
  organisationScopeId: string
  clientId: string
  usageKind: typeof providerAttemptUsageKinds[number]
  operationId: string | null
  correlationId: string
  provider: typeof providerAttemptProviders[number]
  action: typeof providerAttemptActions[number]
  attemptSequence: number
  controlRevision: number
  policyRevision: number
  leaseGeneration: number | null
  state: typeof providerAttemptStates[number]
  providerCallSent: boolean
  providerMutationId: string | null
  usageReservationId: string
}

function mapProviderAttempt(row: ProviderAttemptRow): CrmSearchProviderAttempt {
  if (typeof row.provider_call_sent !== 'boolean') throw crmSearchRepositoryError(errorCode)
  return {
    id: requireUuid(row.id, errorCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, errorCode),
    clientId: requireUuid(row.client_id, errorCode),
    usageKind: requireEnum(row.usage_kind, providerAttemptUsageKinds, errorCode),
    operationId: requireOptionalUuid(row.operation_id, errorCode),
    correlationId: requireUuid(row.correlation_id, errorCode),
    provider: requireEnum(row.provider, providerAttemptProviders, errorCode),
    action: requireEnum(row.provider_action, providerAttemptActions, errorCode),
    attemptSequence: requireSafeInteger(row.attempt_sequence, errorCode, { minimum: 1, maximum: 1000 }),
    controlRevision: requireSafeInteger(row.control_revision, errorCode),
    policyRevision: requireSafeInteger(row.policy_revision, errorCode),
    leaseGeneration: row.lease_generation === null
      ? null
      : requireSafeInteger(row.lease_generation, errorCode, { minimum: 1 }),
    state: requireEnum(row.state, providerAttemptStates, errorCode),
    providerCallSent: row.provider_call_sent,
    providerMutationId: optionalString(row.provider_mutation_id, 256),
    usageReservationId: requireUuid(row.usage_reservation_id, errorCode)
  }
}

export async function loadCrmSearchProviderAttempt(
  input:
    | { operationId: string, providerAttemptId: string }
    | { correlationId: string, providerAttemptId: string },
  dependencies: { queryOneFresh?: CrmSearchQueryOneFresh } = {}
): Promise<CrmSearchProviderAttempt | null> {
  const providerAttemptId = requireUuid(input.providerAttemptId, errorCode)
  const isIndexing = 'operationId' in input
  const scopeId = requireUuid(
    isIndexing ? input.operationId : input.correlationId,
    errorCode
  )
  const read = dependencies.queryOneFresh ?? crmSearchRepositoryDependencies.queryOneFresh
  const row = await read<ProviderAttemptRow>(`
    SELECT attempt.*, reservation.id AS usage_reservation_id
    FROM crm_search_provider_attempts attempt
    JOIN crm_search_usage_reservations reservation
      ON reservation.provider_attempt_id = attempt.id
    WHERE attempt.id = $1
      AND attempt.${isIndexing ? 'operation_id' : 'correlation_id'} = $2
      AND attempt.usage_kind = '${isIndexing ? 'indexing' : 'query'}'
  `, [providerAttemptId, scopeId])
  return row ? mapProviderAttempt(row) : null
}

type MarkProviderAttemptSentInput
  = | {
    usageKind?: 'indexing'
    operationId: string
    providerAttemptId: string
    leaseToken: string
    leaseGeneration: number
  }
  | {
    usageKind: 'query'
    correlationId: string
    providerAttemptId: string
    expectedControlRevision: number
    expectedPolicyRevision: number
  }

export async function markCrmSearchProviderAttemptSent(
  input: MarkProviderAttemptSentInput,
  dependencies: OperationRepositoryDependencies = {}
): Promise<CrmSearchProviderAttempt> {
  const providerAttemptId = requireUuid(input.providerAttemptId, errorCode)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  if (input.usageKind === 'query') {
    const correlationId = requireUuid(input.correlationId, errorCode)
    const controlRevision = requireSafeInteger(input.expectedControlRevision, errorCode)
    const policyRevision = requireSafeInteger(input.expectedPolicyRevision, errorCode)
    return run(async (transaction) => {
      const row = firstRow<ProviderAttemptRow>(await transaction.query<ProviderAttemptRow>(`
        WITH sent_attempt AS (
          UPDATE crm_search_provider_attempts attempt
          SET state = 'sent', provider_call_sent = TRUE, sent_at = NOW(), updated_at = NOW()
          WHERE attempt.id = $1
            AND attempt.correlation_id = $2
            AND attempt.usage_kind = 'query'
            AND attempt.control_revision = $3
            AND attempt.policy_revision = $4
            AND attempt.state = 'precommitted'
            AND attempt.provider_call_sent = FALSE
          RETURNING attempt.*
        ), sent_reservation AS (
          UPDATE crm_search_usage_reservations reservation
          SET provider_call_sent = TRUE
          FROM sent_attempt
          WHERE reservation.provider_attempt_id = sent_attempt.id
            AND reservation.state = 'reserved'
          RETURNING reservation.id, reservation.provider_attempt_id
        )
        SELECT sent_attempt.*, sent_reservation.id AS usage_reservation_id
        FROM sent_attempt
        JOIN sent_reservation ON sent_reservation.provider_attempt_id = sent_attempt.id
      `, [providerAttemptId, correlationId, controlRevision, policyRevision]))
      if (!row) throw crmSearchRepositoryError('crm_search_provider_attempt_changed')
      return mapProviderAttempt(row)
    })
  }
  const operationId = requireUuid(input.operationId, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  return run(async (transaction) => {
    const row = firstRow<ProviderAttemptRow>(await transaction.query<ProviderAttemptRow>(`
      WITH eligible AS (
        SELECT attempt.id
        FROM crm_search_provider_attempts attempt
        JOIN crm_search_operations operation ON operation.id = attempt.operation_id
        WHERE attempt.id = $1
          AND attempt.operation_id = $2
          AND operation.lease_token = $3
          AND operation.lease_generation = $4
          AND attempt.lease_generation = $4
          AND attempt.state = 'precommitted'
          AND attempt.provider_call_sent = FALSE
        FOR UPDATE OF attempt, operation
      ), sent_attempt AS (
        UPDATE crm_search_provider_attempts attempt
        SET state = 'sent', provider_call_sent = TRUE, sent_at = NOW(), updated_at = NOW()
        FROM eligible
        WHERE attempt.id = eligible.id
        RETURNING attempt.*
      ), sent_reservation AS (
        UPDATE crm_search_usage_reservations reservation
        SET provider_call_sent = TRUE
        FROM sent_attempt
        WHERE reservation.provider_attempt_id = sent_attempt.id
          AND reservation.state = 'reserved'
        RETURNING reservation.id, reservation.provider_attempt_id
      )
      SELECT sent_attempt.*, sent_reservation.id AS usage_reservation_id
      FROM sent_attempt
      JOIN sent_reservation ON sent_reservation.provider_attempt_id = sent_attempt.id
    `, [providerAttemptId, operationId, leaseToken, leaseGeneration]))
    if (!row) throw crmSearchRepositoryError('crm_search_provider_attempt_changed')
    return mapProviderAttempt(row)
  })
}

export interface RecordCrmSearchProviderAcceptanceInput {
  operationId: string
  providerAttemptId: string
  reservationId: string
  mutationId: string
  controlRevision: number
  leaseToken: string
  leaseGeneration: number
}

export async function recordCrmSearchProviderAcceptance(
  input: RecordCrmSearchProviderAcceptanceInput,
  dependencies: OperationRepositoryDependencies = {}
): Promise<void> {
  const operationId = requireUuid(input.operationId, errorCode)
  const providerAttemptId = requireUuid(input.providerAttemptId, errorCode)
  const reservationId = requireUuid(input.reservationId, errorCode)
  const mutationId = requireString(input.mutationId, errorCode, { maximumLength: 256 })
  const controlRevision = requireSafeInteger(input.controlRevision, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  await run(async (transaction) => {
    const row = firstRow(await transaction.query(`
      WITH eligible AS (
        SELECT attempt.id
        FROM crm_search_provider_attempts attempt
        JOIN crm_search_usage_reservations reservation
          ON reservation.provider_attempt_id = attempt.id
        JOIN crm_search_operations operation
          ON operation.id = attempt.operation_id
        WHERE attempt.id = $1
          AND reservation.id = $2
          AND operation.id = $3
          AND operation.state = 'admitted'
          AND operation.lease_token = $4
          AND operation.lease_generation = $5
          AND attempt.lease_generation = $5
          AND attempt.control_revision = $6
          AND attempt.provider = 'vectorize'
          AND attempt.provider_action IN ('upsert', 'delete')
          AND attempt.state = 'sent'
          AND attempt.provider_call_sent = TRUE
        FOR UPDATE OF attempt, reservation, operation
      ), accepted_attempt AS (
        UPDATE crm_search_provider_attempts attempt
        SET state = 'accepted', provider_mutation_id = $7,
            settled_at = NOW(), updated_at = NOW()
        FROM eligible
        WHERE attempt.id = eligible.id
        RETURNING attempt.id
      ), provider_pending AS (
        UPDATE crm_search_operations operation
        SET state = 'provider_pending', provider_mutation_id = $7,
            provider_accepted_at = NOW(), provider_attempt_count = provider_attempt_count + 1,
            updated_at = NOW()
        FROM accepted_attempt
        WHERE operation.id = $3
        RETURNING operation.id
      ), document_pending AS (
        INSERT INTO crm_search_documents (
          organisation_scope_id, client_id, entity_type, entity_id, schema_version,
          vector_id, namespace, source_revision, source_event_sequence, content_hash,
          confirmation_tag, confirmation_key_version, confirmation_state, tombstoned,
          provider_mutation_id
        )
        SELECT operation.organisation_scope_id, operation.client_id,
               operation.entity_type, operation.entity_id, operation.schema_version,
               operation.vector_id, operation.namespace, operation.source_revision,
               operation.source_event_sequence, operation.content_hash,
               operation.confirmation_tag, operation.confirmation_key_version,
               CASE WHEN operation.desired_action = 'upsert'
                 THEN 'provider_pending' ELSE 'delete_pending' END,
               FALSE, $7
        FROM provider_pending
        JOIN crm_search_operations operation ON operation.id = provider_pending.id
        ON CONFLICT (organisation_scope_id, client_id, entity_type, entity_id, schema_version)
        DO UPDATE SET
          vector_id = EXCLUDED.vector_id,
          namespace = EXCLUDED.namespace,
          source_revision = EXCLUDED.source_revision,
          source_event_sequence = EXCLUDED.source_event_sequence,
          content_hash = EXCLUDED.content_hash,
          confirmation_tag = EXCLUDED.confirmation_tag,
          confirmation_key_version = EXCLUDED.confirmation_key_version,
          confirmation_state = EXCLUDED.confirmation_state,
          tombstoned = FALSE,
          provider_mutation_id = EXCLUDED.provider_mutation_id,
          updated_at = NOW()
        WHERE crm_search_documents.source_revision <= EXCLUDED.source_revision
          AND crm_search_documents.source_event_sequence <= EXCLUDED.source_event_sequence
          AND (crm_search_documents.source_revision < EXCLUDED.source_revision
            OR crm_search_documents.source_event_sequence < EXCLUDED.source_event_sequence)
        RETURNING id
      )
      SELECT provider_pending.id
      FROM provider_pending
      JOIN document_pending ON TRUE
    `, [providerAttemptId, reservationId, operationId, leaseToken, leaseGeneration,
      controlRevision, mutationId]))
    if (!row || requireUuid(row.id, errorCode) !== operationId) {
      throw crmSearchRepositoryError('crm_search_provider_acceptance_changed')
    }
  })
}

export interface MarkCrmSearchProviderAttemptAmbiguousInput {
  operationId: string
  providerAttemptId: string
  reservationId: string
  leaseToken: string
  leaseGeneration: number
}

export async function markCrmSearchProviderAttemptAmbiguous(
  input: MarkCrmSearchProviderAttemptAmbiguousInput,
  dependencies: OperationRepositoryDependencies = {}
): Promise<void> {
  const operationId = requireUuid(input.operationId, errorCode)
  const providerAttemptId = requireUuid(input.providerAttemptId, errorCode)
  const reservationId = requireUuid(input.reservationId, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  await run(async (transaction) => {
    const row = firstRow(await transaction.query(`
      WITH ambiguous_attempt AS (
        UPDATE crm_search_provider_attempts attempt
        SET state = 'ambiguous', settled_at = NOW(), updated_at = NOW()
        FROM crm_search_usage_reservations reservation,
             crm_search_operations operation
        WHERE attempt.id = $1
          AND reservation.id = $2
          AND reservation.provider_attempt_id = attempt.id
          AND operation.id = $3
          AND operation.id = attempt.operation_id
          AND operation.lease_token = $4
          AND operation.lease_generation = $5
          AND attempt.lease_generation = $5
          AND attempt.state = 'sent'
          AND attempt.provider_call_sent = TRUE
        RETURNING attempt.id, attempt.provider
      ), document_pending AS (
        INSERT INTO crm_search_documents (
          organisation_scope_id, client_id, entity_type, entity_id, schema_version,
          vector_id, namespace, source_revision, source_event_sequence, content_hash,
          confirmation_tag, confirmation_key_version, confirmation_state, tombstoned
        )
        SELECT operation.organisation_scope_id, operation.client_id,
               operation.entity_type, operation.entity_id, operation.schema_version,
               operation.vector_id, operation.namespace, operation.source_revision,
               operation.source_event_sequence, operation.content_hash,
               operation.confirmation_tag, operation.confirmation_key_version,
               CASE WHEN operation.desired_action = 'upsert'
                 THEN 'provider_pending' ELSE 'delete_pending' END,
               FALSE
        FROM ambiguous_attempt
        JOIN crm_search_operations operation ON operation.id = $3
        WHERE ambiguous_attempt.provider = 'vectorize'
        ON CONFLICT (organisation_scope_id, client_id, entity_type, entity_id, schema_version)
        DO UPDATE SET
          vector_id = EXCLUDED.vector_id,
          namespace = EXCLUDED.namespace,
          source_revision = EXCLUDED.source_revision,
          source_event_sequence = EXCLUDED.source_event_sequence,
          content_hash = EXCLUDED.content_hash,
          confirmation_tag = EXCLUDED.confirmation_tag,
          confirmation_key_version = EXCLUDED.confirmation_key_version,
          confirmation_state = EXCLUDED.confirmation_state,
          tombstoned = FALSE,
          provider_mutation_id = NULL,
          updated_at = NOW()
        WHERE crm_search_documents.source_revision <= EXCLUDED.source_revision
          AND crm_search_documents.source_event_sequence <= EXCLUDED.source_event_sequence
          AND (crm_search_documents.source_revision < EXCLUDED.source_revision
            OR crm_search_documents.source_event_sequence < EXCLUDED.source_event_sequence)
        RETURNING id
      )
      SELECT ambiguous_attempt.id
      FROM ambiguous_attempt
      LEFT JOIN document_pending ON TRUE
      WHERE ambiguous_attempt.provider = 'workers_ai' OR document_pending.id IS NOT NULL
    `, [providerAttemptId, reservationId, operationId, leaseToken, leaseGeneration]))
    if (!row || requireUuid(row.id, errorCode) !== providerAttemptId) {
      throw crmSearchRepositoryError('crm_search_provider_attempt_changed')
    }
  })
}

export async function claimCrmSearchOperations(
  input: ClaimCrmSearchOperationsInput,
  dependencies: OperationRepositoryDependencies = {}
): Promise<CrmSearchOperation[]> {
  const limit = requireSafeInteger(input.limit, errorCode, { minimum: 1, maximum: 100 })
  const leaseSeconds = requireSafeInteger(input.leaseSeconds, errorCode, { minimum: 1, maximum: 900 })
  const now = requireTimestamp(input.now, errorCode)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    await transaction.query(`
      WITH dispatchable AS (
        SELECT id FROM crm_search_operations
        WHERE state = 'pending_transport'
          AND next_attempt_at <= $1
          AND lease_token IS NULL
        ORDER BY next_attempt_at, created_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crm_search_operations operation
      SET state = 'queued',
          transport_attempt_count = operation.transport_attempt_count + 1,
          updated_at = $1
      FROM dispatchable
      WHERE operation.id = dispatchable.id
    `, [now, limit])
    const result = await transaction.query<OperationRow>(`
      WITH claimable AS (
        SELECT id FROM crm_search_operations
        WHERE state IN ('queued', 'retryable')
          AND next_attempt_at <= $1
          AND (lease_token IS NULL OR lease_expires_at <= $1)
        ORDER BY next_attempt_at, created_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crm_search_operations operation
      SET state = 'processing',
          lease_token = gen_random_uuid(),
          lease_generation = operation.lease_generation + 1,
          lease_expires_at = $1::TIMESTAMPTZ + ($3 * INTERVAL '1 second'),
          processing_attempt_count = operation.processing_attempt_count + 1,
          updated_at = $1
      FROM claimable
      WHERE operation.id = claimable.id
      RETURNING operation.*
    `, [now, limit, leaseSeconds])
    return result.rows.map(mapOperation)
  })
}

export interface CompleteCrmSearchOperationClaimInput {
  id: string
  leaseToken: string
  leaseGeneration: number
  expectedState: OperationState
  nextState: OperationState
  errorClass: string | null
  nextAttemptAt: string
}

export async function completeCrmSearchOperationClaim(
  input: CompleteCrmSearchOperationClaimInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const id = requireUuid(input.id, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  const expectedState = requireEnum(input.expectedState, operationStates, errorCode)
  const nextState = requireEnum(input.nextState, operationStates, errorCode)
  const errorClass = input.errorClass === null ? null : requireBoundedClass(input.errorClass, errorCode)
  const nextAttemptAt = requireTimestamp(input.nextAttemptAt, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_operations
    SET state = $5, error_class = $6, next_attempt_at = $7,
        lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
    WHERE id = $1
      AND lease_token = $2
      AND lease_generation = $3
      AND state = $4
  `, [id, leaseToken, leaseGeneration, expectedState, nextState, errorClass, nextAttemptAt])
  return affectedRows(result) === 1
}

export interface AdmitCrmSearchOperationInput {
  operationId: string
  expectedState: 'processing' | 'retryable'
  expectedControlRevision: number
  leaseToken: string
  leaseGeneration: number
}

export async function admitCrmSearchOperation(
  input: AdmitCrmSearchOperationInput,
  transaction: CrmSearchTransactionClient
): Promise<{ state: 'admitted', controlRevision: number, leaseGeneration: number }> {
  const operationId = requireUuid(input.operationId, errorCode)
  const expectedState = requireEnum(input.expectedState, ['processing', 'retryable'] as const, errorCode)
  const controlRevision = requireSafeInteger(input.expectedControlRevision, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  const row = firstRow(await transaction.query(`
    WITH leased AS (
      SELECT id FROM crm_search_operations
      WHERE id = $1 AND state = $2 AND lease_token = $4 AND lease_generation = $5
      FOR UPDATE
    ), admitted AS (
      SELECT crm_search_admit_operation($1, $2, $3) AS state
      FROM leased
    )
    SELECT admitted.state, operation.control_revision, operation.lease_generation
    FROM admitted JOIN crm_search_operations operation ON operation.id = $1
  `, [operationId, expectedState, controlRevision, leaseToken, leaseGeneration]))
  if (!row || row.state !== 'admitted') throw crmSearchRepositoryError('crm_search_admission_rejected')
  return {
    state: 'admitted',
    controlRevision: requireSafeInteger(row.control_revision, errorCode),
    leaseGeneration: requireSafeInteger(row.lease_generation, errorCode, { minimum: 1 })
  }
}
