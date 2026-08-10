import { CRM_SEARCH_ENTITY_TYPES } from './contracts'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireEnum,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_teardown_not_authorized'
const deletionStates = ['pending', 'provider_pending', 'confirmed_absent', 'failed'] as const

export interface RequireCrmSearchTeardownDeleteAuthorityInput {
  organisationScopeId: string
  clientId: string
  teardownId: string
  vectorId: string
  schemaVersion: string
}

export interface CrmSearchTeardownDeleteAuthority {
  controlRevision: number
  policyRevision: number
  namespace: string
  sourceRevision: number
  teardownId: string
}

function providerId(value: unknown): string {
  return requireString(value, errorCode, { maximumLength: 64, pattern: /^[A-Za-z0-9_-]+$/ })
}

export async function requireCrmSearchTeardownDeleteAuthority(
  input: RequireCrmSearchTeardownDeleteAuthorityInput,
  transaction: CrmSearchTransactionClient
): Promise<CrmSearchTeardownDeleteAuthority> {
  try {
    const organisationScopeId = requireUuid(input.organisationScopeId, errorCode)
    const clientId = requireUuid(input.clientId, errorCode)
    const teardownId = requireUuid(input.teardownId, errorCode)
    const vectorId = providerId(input.vectorId)
    const schemaVersion = requireSchemaVersion(input.schemaVersion, errorCode)
    const control = firstRow(await transaction.query(`
      SELECT state, revision
      FROM crm_search_global_control
      WHERE organisation_scope_id = $1
      FOR SHARE
    `, [organisationScopeId]))
    if (!control || !['enabled', 'delete_only'].includes(String(control.state))) {
      throw crmSearchRepositoryError(errorCode)
    }
    const controlRevision = requireSafeInteger(control.revision, errorCode)
    const vector = firstRow(await transaction.query(`
      SELECT
        teardown.id AS teardown_id,
        teardown.state AS teardown_state,
        teardown.provider_deletion_state,
        teardown.policy_revision,
        vector.vector_id,
        vector.schema_version,
        vector.namespace,
        vector.deletion_state,
        vector.source_revision
      FROM crm_search_client_teardowns teardown
      JOIN crm_search_teardown_vectors vector ON vector.teardown_id = teardown.id
      WHERE teardown.id = $1
        AND teardown.organisation_scope_id = $2
        AND teardown.client_id = $3
        AND vector.vector_id = $4
        AND vector.schema_version = $5
      FOR UPDATE OF teardown, vector
    `, [teardownId, organisationScopeId, clientId, vectorId, schemaVersion]))
    const authorized = vector?.teardown_id === teardownId
      && ['deleting', 'provider_pending'].includes(String(vector.teardown_state))
      && ['pending', 'partially_confirmed'].includes(String(vector.provider_deletion_state))
      && ['pending', 'provider_pending', 'failed'].includes(String(vector.deletion_state))
    if (!authorized) throw crmSearchRepositoryError(errorCode)
    return {
      controlRevision,
      policyRevision: requireSafeInteger(vector.policy_revision, errorCode),
      namespace: providerId(vector.namespace),
      sourceRevision: requireSafeInteger(vector.source_revision, errorCode, { minimum: 1 }),
      teardownId
    }
  } catch {
    throw crmSearchRepositoryError(errorCode)
  }
}

interface TeardownVectorRow extends Record<string, unknown> {
  id: unknown
  teardown_id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  entity_type: unknown
  entity_id: unknown
  schema_version: unknown
  vector_id: unknown
  namespace: unknown
  source_revision: unknown
  deletion_state: unknown
  attempt_count: unknown
}

export interface CrmSearchTeardownVectorClaim {
  id: string
  teardownId: string
  organisationScopeId: string
  clientId: string
  entityType: typeof CRM_SEARCH_ENTITY_TYPES[number]
  entityId: string | null
  schemaVersion: string
  vectorId: string
  namespace: string
  sourceRevision: number
  deletionState: typeof deletionStates[number]
  attemptCount: number
}

function mapTeardownVector(row: TeardownVectorRow): CrmSearchTeardownVectorClaim {
  return {
    id: requireUuid(row.id, errorCode),
    teardownId: requireUuid(row.teardown_id, errorCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, errorCode),
    clientId: requireUuid(row.client_id, errorCode),
    entityType: requireEnum(row.entity_type, CRM_SEARCH_ENTITY_TYPES, errorCode),
    entityId: requireUuid(row.entity_id, errorCode),
    schemaVersion: requireSchemaVersion(row.schema_version, errorCode),
    vectorId: providerId(row.vector_id),
    namespace: providerId(row.namespace),
    sourceRevision: requireSafeInteger(row.source_revision, errorCode, { minimum: 1 }),
    deletionState: requireEnum(row.deletion_state, deletionStates, errorCode),
    attemptCount: requireSafeInteger(row.attempt_count, errorCode, { maximum: 1000 })
  }
}

export interface ClaimCrmSearchTeardownVectorsInput {
  teardownId: string
  limit: number
}

export interface TeardownRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

export async function claimCrmSearchTeardownVectors(
  input: ClaimCrmSearchTeardownVectorsInput,
  dependencies: TeardownRepositoryDependencies = {}
): Promise<CrmSearchTeardownVectorClaim[]> {
  const teardownId = requireUuid(input.teardownId, errorCode)
  const limit = requireSafeInteger(input.limit, errorCode, { minimum: 1, maximum: 100 })
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    const result = await transaction.query<TeardownVectorRow>(`
      WITH claimable AS (
        SELECT id
        FROM crm_search_teardown_vectors
        WHERE teardown_id = $1 AND deletion_state IN ('pending', 'failed')
        ORDER BY created_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crm_search_teardown_vectors vector
      SET attempt_count = vector.attempt_count + 1,
          deletion_state = 'provider_pending',
          updated_at = NOW()
      FROM claimable
      WHERE vector.id = claimable.id
      RETURNING vector.*
    `, [teardownId, limit])
    return result.rows.map(mapTeardownVector)
  })
}

export interface CompleteCrmSearchTeardownVectorClaimInput {
  teardownId: string
  vectorId: string
  schemaVersion: string
  expectedDeletionState: typeof deletionStates[number]
  expectedProviderMutationId: string
  confirmedAbsentAt: string
}

export async function completeCrmSearchTeardownVectorClaim(
  input: CompleteCrmSearchTeardownVectorClaimInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const teardownId = requireUuid(input.teardownId, errorCode)
  const vectorId = providerId(input.vectorId)
  const schemaVersion = requireSchemaVersion(input.schemaVersion, errorCode)
  const expectedState = requireEnum(input.expectedDeletionState, deletionStates, errorCode)
  const providerMutationId = requireString(input.expectedProviderMutationId, errorCode, { maximumLength: 256 })
  const confirmedAbsentAt = requireTimestamp(input.confirmedAbsentAt, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_teardown_vectors
    SET deletion_state = 'confirmed_absent',
        confirmed_absent_at = $6,
        last_error_class = NULL,
        updated_at = NOW()
    WHERE teardown_id = $1
      AND vector_id = $2
      AND schema_version = $3
      AND deletion_state = $4
      AND provider_mutation_id = $5
  `, [teardownId, vectorId, schemaVersion, expectedState, providerMutationId, confirmedAbsentAt])
  return affectedRows(result) === 1
}
