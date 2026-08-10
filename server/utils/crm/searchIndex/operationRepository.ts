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
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_invalid_operation'
const operationStates = [
  'pending_transport', 'queued', 'processing', 'admitted', 'provider_pending',
  'retryable', 'confirmed', 'superseded', 'terminal_dead_letter'
] as const
type OperationState = typeof operationStates[number]

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
  source_revision = $6,
  source_event_sequence = $7,
  desired_action = $8,
  vector_id = $9,
  namespace = $10,
  content_hash = $11,
  confirmation_tag = $12,
  confirmation_key_version = $13,
  state = 'pending_transport',
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
          successor_of = $14
      WHERE id = $15
        AND ${inflight ? 'successor_of = $14' : 'successor_of IS NULL'}
        AND provider_admitted_at IS NULL
      RETURNING *
    `, [...intentParams(input), inflight?.id ?? null, replaceable.id])
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

export interface OperationRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
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
    const result = await transaction.query<OperationRow>(`
      WITH claimable AS (
        SELECT id FROM crm_search_operations
        WHERE state IN ('pending_transport', 'retryable')
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
