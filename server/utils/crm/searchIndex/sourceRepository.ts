import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_PROVIDER_ACTIONS,
  type CrmSearchEntityType,
  type CrmSearchProviderAction
} from './contracts'
import {
  affectedRows,
  crmSearchRepositoryDependencies,
  requireBoundedClass,
  requireEnum,
  requireSafeInteger,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'

const errorCode = 'crm_search_invalid_claim'

interface SourceClaimRow extends Record<string, unknown> {
  id: unknown
  organisation_scope_id: unknown
  client_id: unknown
  entity_type: unknown
  entity_id: unknown
  source_revision: unknown
  desired_action: unknown
  event_sequence: unknown
  claim_token: unknown
  claim_generation: unknown
  claim_lease_expires_at: unknown
  attempt_count: unknown
}

export interface CrmSearchDirtySourceClaim {
  id: string
  organisationScopeId: string
  clientId: string
  entityType: CrmSearchEntityType
  entityId: string
  sourceRevision: number
  desiredAction: CrmSearchProviderAction
  eventSequence: number
  claimToken: string
  claimGeneration: number
  claimLeaseExpiresAt: string
  attemptCount: number
}

export interface ClaimCrmSearchDirtySourcesInput {
  limit: number
  leaseSeconds: number
  now: string
}

export interface SourceRepositoryDependencies {
  transactionWithoutRetry?: CrmSearchTransactionWithoutRetry
}

function mapClaim(row: SourceClaimRow): CrmSearchDirtySourceClaim {
  return {
    id: requireUuid(row.id, errorCode),
    organisationScopeId: requireUuid(row.organisation_scope_id, errorCode),
    clientId: requireUuid(row.client_id, errorCode),
    entityType: requireEnum(row.entity_type, CRM_SEARCH_ENTITY_TYPES, errorCode),
    entityId: requireUuid(row.entity_id, errorCode),
    sourceRevision: requireSafeInteger(row.source_revision, errorCode, { minimum: 1 }),
    desiredAction: requireEnum(row.desired_action, CRM_SEARCH_PROVIDER_ACTIONS, errorCode),
    eventSequence: requireSafeInteger(row.event_sequence, errorCode, { minimum: 1 }),
    claimToken: requireUuid(row.claim_token, errorCode),
    claimGeneration: requireSafeInteger(row.claim_generation, errorCode, { minimum: 1 }),
    claimLeaseExpiresAt: requireTimestamp(row.claim_lease_expires_at, errorCode),
    attemptCount: requireSafeInteger(row.attempt_count, errorCode, { maximum: 1000 })
  }
}

export async function claimCrmSearchDirtySources(
  input: ClaimCrmSearchDirtySourcesInput,
  dependencies: SourceRepositoryDependencies = {}
): Promise<CrmSearchDirtySourceClaim[]> {
  const limit = requireSafeInteger(input.limit, errorCode, { minimum: 1, maximum: 100 })
  const leaseSeconds = requireSafeInteger(input.leaseSeconds, errorCode, { minimum: 1, maximum: 900 })
  const now = requireTimestamp(input.now, errorCode)
  const run = dependencies.transactionWithoutRetry
    ?? crmSearchRepositoryDependencies.transactionWithoutRetry
  return run(async (transaction) => {
    const result = await transaction.query<SourceClaimRow>(`
      WITH claimable AS (
        SELECT id
        FROM crm_search_source_dirty
        WHERE next_attempt_at <= $1
          AND (claim_token IS NULL OR claim_lease_expires_at <= $1)
        ORDER BY event_sequence, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE crm_search_source_dirty dirty
      SET claim_token = gen_random_uuid(),
          claim_generation = dirty.claim_generation + 1,
          claim_lease_expires_at = $1::TIMESTAMPTZ + ($3 * INTERVAL '1 second'),
          attempt_count = dirty.attempt_count + 1,
          updated_at = $1
      FROM claimable
      WHERE dirty.id = claimable.id
      RETURNING dirty.*
    `, [now, limit, leaseSeconds])
    return result.rows.map(mapClaim)
  })
}

export async function completeCrmSearchDirtySourceClaim(
  input: Pick<CrmSearchDirtySourceClaim,
    'id' | 'sourceRevision' | 'eventSequence' | 'claimToken' | 'claimGeneration'>,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const id = requireUuid(input.id, errorCode)
  const sourceRevision = requireSafeInteger(input.sourceRevision, errorCode, { minimum: 1 })
  const eventSequence = requireSafeInteger(input.eventSequence, errorCode, { minimum: 1 })
  const claimToken = requireUuid(input.claimToken, errorCode)
  const claimGeneration = requireSafeInteger(input.claimGeneration, errorCode, { minimum: 1 })
  const result = await transaction.query(`
    DELETE FROM crm_search_source_dirty
    WHERE id = $1
      AND source_revision = $2
      AND event_sequence = $3
      AND claim_token = $4
      AND claim_generation = $5
  `, [id, sourceRevision, eventSequence, claimToken, claimGeneration])
  return affectedRows(result) === 1
}

export interface ReleaseCrmSearchDirtySourceClaimInput {
  id: string
  claimToken: string
  claimGeneration: number
  errorClass: string
  nextAttemptAt: string
}

export async function releaseCrmSearchDirtySourceClaim(
  input: ReleaseCrmSearchDirtySourceClaimInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const id = requireUuid(input.id, errorCode)
  const claimToken = requireUuid(input.claimToken, errorCode)
  const claimGeneration = requireSafeInteger(input.claimGeneration, errorCode, { minimum: 1 })
  const errorClass = requireBoundedClass(input.errorClass, errorCode)
  const nextAttemptAt = requireTimestamp(input.nextAttemptAt, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_source_dirty
    SET claim_token = NULL,
        claim_lease_expires_at = NULL,
        error_class = $4,
        next_attempt_at = $5,
        updated_at = NOW()
    WHERE id = $1
      AND claim_token = $2
      AND claim_generation = $3
  `, [id, claimToken, claimGeneration, errorClass, nextAttemptAt])
  return affectedRows(result) === 1
}
