import {
  affectedRows,
  crmSearchRepositoryDependencies,
  requireBoundedClass,
  requireSafeInteger,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_invalid_publication_claim'

interface PublicationClaimRow extends Record<string, unknown> {
  operation_id: unknown
  claim_token: unknown
  claim_generation: unknown
}

export interface CrmSearchOperationPublicationClaim {
  operationId: string
  claimToken: string
  claimGeneration: number
}

export interface ClaimCrmSearchOperationsForPublicationInput {
  limit: number
  leaseSeconds: number
  now: string
}

export interface CrmSearchPublicationRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

function mapClaim(row: PublicationClaimRow): CrmSearchOperationPublicationClaim {
  return {
    operationId: requireUuid(row.operation_id, errorCode),
    claimToken: requireUuid(row.claim_token, errorCode),
    claimGeneration: requireSafeInteger(row.claim_generation, errorCode, { minimum: 1 })
  }
}

/**
 * Acquires a publication-only lease without transitioning the operation into
 * processor state. Queue durability must be confirmed separately by CAS.
 */
export async function claimCrmSearchOperationsForPublication(
  input: ClaimCrmSearchOperationsForPublicationInput,
  dependencies: CrmSearchPublicationRepositoryDependencies = {}
): Promise<CrmSearchOperationPublicationClaim[]> {
  const limit = requireSafeInteger(input.limit, errorCode, { minimum: 1, maximum: 100 })
  const leaseSeconds = requireSafeInteger(input.leaseSeconds, errorCode, {
    minimum: 1,
    maximum: 900
  })
  const now = requireTimestamp(input.now, errorCode)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry

  return await run(async (transaction) => {
    const result = await transaction.query<PublicationClaimRow>(`
      WITH claimable AS (
        SELECT operation.id
        FROM crm_search_operations operation
        JOIN crm_search_global_control control
          ON control.organisation_scope_id = operation.organisation_scope_id
        LEFT JOIN crm_search_policies policy
          ON policy.organisation_scope_id = operation.organisation_scope_id
         AND policy.client_id = operation.client_id
        LEFT JOIN crm_search_schema_versions schema
          ON schema.organisation_scope_id = operation.organisation_scope_id
         AND schema.schema_version = operation.schema_version
        WHERE operation.state = 'pending_transport'
          AND operation.next_attempt_at <= $1
          AND (operation.lease_token IS NULL OR operation.lease_expires_at <= $1)
          AND operation.transport_attempt_count < 1000
          AND (
            (
              operation.desired_action = 'upsert'
              AND control.state = 'enabled'
              AND control.indexing_ready = TRUE
              AND policy.indexing_enabled = TRUE
              AND policy.lifecycle_state IN ('indexing', 'shadow', 'assist')
              AND operation.schema_version IN (
                policy.active_schema_version,
                policy.candidate_schema_version
              )
              AND schema.metadata_index_state = 'ready'
              AND schema.sentinel_state = 'confirmed_absent'
            )
            OR (
              operation.desired_action = 'delete'
              AND control.state IN ('enabled', 'delete_only')
              AND (
                EXISTS (
                  SELECT 1
                  FROM crm_search_client_teardowns teardown
                  JOIN crm_search_teardown_vectors vector
                    ON vector.teardown_id = teardown.id
                  WHERE teardown.organisation_scope_id = operation.organisation_scope_id
                    AND teardown.client_id = operation.client_id
                    AND teardown.namespace = operation.namespace
                    AND teardown.state IN ('deleting', 'provider_pending')
                    AND teardown.provider_deletion_state IN ('pending', 'partially_confirmed')
                    AND vector.organisation_scope_id = operation.organisation_scope_id
                    AND vector.client_id = operation.client_id
                    AND vector.entity_type = operation.entity_type
                    AND vector.entity_id = operation.entity_id
                    AND vector.schema_version = operation.schema_version
                    AND vector.vector_id = operation.vector_id
                    AND vector.namespace = operation.namespace
                    AND vector.deletion_state IN ('pending', 'provider_pending', 'failed')
                )
                OR (
                  control.state = 'enabled'
                  AND control.indexing_ready = TRUE
                  AND policy.indexing_enabled = TRUE
                  AND policy.lifecycle_state IN ('indexing', 'shadow', 'assist')
                  AND (
                    operation.schema_version = policy.active_schema_version
                    OR operation.schema_version = policy.candidate_schema_version
                    OR operation.schema_version = ANY(policy.retiring_schema_versions)
                  )
                )
              )
            )
          )
        ORDER BY operation.next_attempt_at, operation.created_at, operation.id
        LIMIT $2
        FOR UPDATE OF operation SKIP LOCKED
      )
      UPDATE crm_search_operations operation
      SET lease_token = gen_random_uuid(),
          lease_generation = operation.lease_generation + 1,
          lease_expires_at = $1::TIMESTAMPTZ + ($3 * INTERVAL '1 second'),
          transport_attempt_count = operation.transport_attempt_count + 1,
          error_class = NULL,
          updated_at = $1
      FROM claimable
      WHERE operation.id = claimable.id
      RETURNING operation.id AS operation_id,
                operation.lease_token AS claim_token,
                operation.lease_generation AS claim_generation
    `, [now, limit, leaseSeconds])
    return result.rows.map(mapClaim)
  })
}

export interface ConfirmCrmSearchOperationPublishedInput {
  operationId: string
  claimToken: string
  claimGeneration: number
  publishedAt: string
}

export async function confirmCrmSearchOperationPublished(
  input: ConfirmCrmSearchOperationPublishedInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const operationId = requireUuid(input.operationId, errorCode)
  const claimToken = requireUuid(input.claimToken, errorCode)
  const claimGeneration = requireSafeInteger(input.claimGeneration, errorCode, { minimum: 1 })
  const publishedAt = requireTimestamp(input.publishedAt, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_operations
    SET state = 'queued',
        lease_token = NULL,
        lease_expires_at = NULL,
        error_class = NULL,
        next_attempt_at = $4,
        updated_at = $4
    WHERE id = $1
      AND lease_token = $2
      AND lease_generation = $3
      AND state = 'pending_transport'
    RETURNING id
  `, [operationId, claimToken, claimGeneration, publishedAt])
  return affectedRows(result) === 1
}

export interface RescheduleCrmSearchOperationPublicationInput {
  operationId: string
  claimToken: string
  claimGeneration: number
  errorClass: string
  nextAttemptAt: string
}

export async function rescheduleCrmSearchOperationPublication(
  input: RescheduleCrmSearchOperationPublicationInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const operationId = requireUuid(input.operationId, errorCode)
  const claimToken = requireUuid(input.claimToken, errorCode)
  const claimGeneration = requireSafeInteger(input.claimGeneration, errorCode, { minimum: 1 })
  const errorClass = requireBoundedClass(input.errorClass, errorCode)
  const nextAttemptAt = requireTimestamp(input.nextAttemptAt, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_operations
    SET state = 'pending_transport',
        lease_token = NULL,
        lease_expires_at = NULL,
        error_class = $4,
        next_attempt_at = $5,
        updated_at = NOW()
    WHERE id = $1
      AND lease_token = $2
      AND lease_generation = $3
      AND state = 'pending_transport'
    RETURNING id
  `, [operationId, claimToken, claimGeneration, errorClass, nextAttemptAt])
  return affectedRows(result) === 1
}
