import {
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_PROVIDER_ACTIONS
} from './contracts'
import {
  affectedRows,
  crmSearchRepositoryError,
  requireDigest,
  requireEnum,
  requireHmacDigest,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireUuid,
  type CrmSearchTransactionClient
} from './repository'

const errorCode = 'crm_search_invalid_document'
const confirmationStates = [
  'absent', 'provider_pending', 'indexed', 'delete_pending', 'deleted', 'error'
] as const

export interface UpsertCrmSearchDocumentCasInput {
  organisationScopeId: string
  clientId: string
  entityType: typeof CRM_SEARCH_ENTITY_TYPES[number]
  entityId: string
  schemaVersion: string
  desiredAction: typeof CRM_SEARCH_PROVIDER_ACTIONS[number]
  vectorId: string
  namespace: string
  sourceRevision: number
  sourceEventSequence: number
  contentHash: string | null
  confirmationTag: string | null
  confirmationKeyVersion: string | null
  confirmationState: typeof confirmationStates[number]
  tombstoned: boolean
  providerMutationId: string | null
  expectedSourceRevision: number
  expectedSourceEventSequence: number
}

function providerId(value: unknown): string {
  return requireString(value, errorCode, { maximumLength: 64, pattern: /^[A-Za-z0-9_-]+$/ })
}

export async function upsertCrmSearchDocumentCas(
  input: UpsertCrmSearchDocumentCasInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const organisationScopeId = requireUuid(input.organisationScopeId, errorCode)
  const clientId = requireUuid(input.clientId, errorCode)
  const entityType = requireEnum(input.entityType, CRM_SEARCH_ENTITY_TYPES, errorCode)
  const entityId = requireUuid(input.entityId, errorCode)
  const schemaVersion = requireSchemaVersion(input.schemaVersion, errorCode)
  requireEnum(input.desiredAction, CRM_SEARCH_PROVIDER_ACTIONS, errorCode)
  const vectorId = providerId(input.vectorId)
  const namespace = providerId(input.namespace)
  const sourceRevision = requireSafeInteger(input.sourceRevision, errorCode, { minimum: 1 })
  const sourceEventSequence = requireSafeInteger(input.sourceEventSequence, errorCode, { minimum: 1 })
  const contentHash = input.contentHash === null ? null : requireDigest(input.contentHash, errorCode)
  const confirmationTag = input.confirmationTag === null
    ? null
    : requireHmacDigest(input.confirmationTag, errorCode)
  const confirmationKeyVersion = input.confirmationKeyVersion === null
    ? null
    : requireString(input.confirmationKeyVersion, errorCode, { maximumLength: 80 })
  const confirmationState = requireEnum(input.confirmationState, confirmationStates, errorCode)
  if (typeof input.tombstoned !== 'boolean') throw crmSearchRepositoryError(errorCode)
  const providerMutationId = input.providerMutationId === null
    ? null
    : requireString(input.providerMutationId, errorCode, { maximumLength: 256 })
  const expectedSourceRevision = requireSafeInteger(input.expectedSourceRevision, errorCode)
  const expectedSourceEventSequence = requireSafeInteger(input.expectedSourceEventSequence, errorCode)
  if (confirmationState === 'provider_pending' && providerMutationId === null) {
    throw crmSearchRepositoryError(errorCode)
  }
  const values = [organisationScopeId, clientId, entityType, entityId, schemaVersion, vectorId,
    namespace, sourceRevision, sourceEventSequence, contentHash, confirmationTag,
    confirmationKeyVersion, confirmationState, input.tombstoned, providerMutationId]
  let result
  if (expectedSourceRevision === 0 && expectedSourceEventSequence === 0) {
    result = await transaction.query(`
      INSERT INTO crm_search_documents (
        organisation_scope_id, client_id, entity_type, entity_id, schema_version,
        vector_id, namespace, source_revision, source_event_sequence, content_hash,
        confirmation_tag, confirmation_key_version, confirmation_state, tombstoned,
        provider_mutation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, values)
  } else {
    if (expectedSourceRevision < 1
      || expectedSourceEventSequence < 1
      || sourceRevision <= expectedSourceRevision
      || sourceEventSequence <= expectedSourceEventSequence) {
      throw crmSearchRepositoryError(errorCode)
    }
    result = await transaction.query(`
      UPDATE crm_search_documents
      SET vector_id = $6,
          namespace = $7,
          source_revision = $8,
          source_event_sequence = $9,
          content_hash = $10,
          confirmation_tag = $11,
          confirmation_key_version = $12,
          confirmation_state = $13,
          tombstoned = $14,
          provider_mutation_id = $15,
          updated_at = NOW()
      WHERE organisation_scope_id = $1
        AND client_id = $2
        AND entity_type = $3
        AND entity_id = $4
        AND schema_version = $5
        AND source_revision = $16
        AND source_event_sequence = $17
        AND source_revision < $8
        AND source_event_sequence < $9
      RETURNING id
    `, [...values, expectedSourceRevision, expectedSourceEventSequence])
  }
  return affectedRows(result) === 1
}

export interface CompleteCrmSearchDocumentClaimInput {
  documentId: string
  leaseToken: string
  leaseGeneration: number
  expectedConfirmationState: typeof confirmationStates[number]
  nextConfirmationState: typeof confirmationStates[number]
  expectedSourceRevision: number
  expectedProviderMutationId: string
  providerHighWatermark: number
}

export async function completeCrmSearchDocumentClaim(
  input: CompleteCrmSearchDocumentClaimInput,
  transaction: CrmSearchTransactionClient
): Promise<boolean> {
  const documentId = requireUuid(input.documentId, errorCode)
  const leaseToken = requireUuid(input.leaseToken, errorCode)
  const leaseGeneration = requireSafeInteger(input.leaseGeneration, errorCode, { minimum: 1 })
  const expectedState = requireEnum(input.expectedConfirmationState, confirmationStates, errorCode)
  const nextState = requireEnum(input.nextConfirmationState, confirmationStates, errorCode)
  const sourceRevision = requireSafeInteger(input.expectedSourceRevision, errorCode, { minimum: 1 })
  const providerMutationId = requireString(input.expectedProviderMutationId, errorCode, { maximumLength: 256 })
  const providerHighWatermark = requireSafeInteger(input.providerHighWatermark, errorCode)
  const result = await transaction.query(`
    UPDATE crm_search_documents
    SET confirmation_state = $7,
        provider_high_watermark = $8,
        tombstoned = CASE WHEN $7 = 'deleted' THEN TRUE ELSE tombstoned END,
        last_confirmed_at = NOW(),
        lease_token = NULL,
        updated_at = NOW()
    WHERE id = $1
      AND lease_token = $2
      AND lease_generation = $3
      AND confirmation_state = $4
      AND source_revision = $5
      AND provider_mutation_id = $6
  `, [documentId, leaseToken, leaseGeneration, expectedState, sourceRevision,
    providerMutationId, nextState, providerHighWatermark])
  return affectedRows(result) === 1
}
