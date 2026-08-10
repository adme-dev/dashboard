import {
  createCrmSearchConfirmationTag,
  parseCrmSearchConfirmationKeyring,
  type CrmSearchConfirmationKeyring,
  type CrmSearchConfirmationTag,
  type CreateCrmSearchConfirmationTagInput
} from './confirmation'
import {
  CRM_SEARCH_POLICY_STATES,
  type CrmSearchPolicyState
} from './contracts'
import { deriveCrmSearchVectorId } from './identity'
import {
  upsertCrmSearchOperation,
  type CrmSearchOperation,
  type UpsertCrmSearchOperationInput
} from './operationRepository'
import {
  crmSearchRepositoryDependencies,
  firstRow,
  requireBoolean,
  requireDigest,
  requireEnum,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  type CrmSearchTransactionClient,
  type CrmSearchTransactionWithoutRetry
} from './repository'
import {
  claimCrmSearchDirtySources,
  completeCrmSearchDirtySourceClaim,
  releaseCrmSearchDirtySourceClaim,
  type ClaimCrmSearchDirtySourcesInput,
  type CrmSearchDirtySourceClaim,
  type ReleaseCrmSearchDirtySourceClaimInput
} from './sourceRepository'

export const CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS = 8 as const
export const CRM_SEARCH_DIRTY_EXPANSION_RETRY_SECONDS = 300 as const

const errorCode = 'crm_search_invalid_dirty_expansion'
const globalStates = ['halted', 'delete_only', 'enabled'] as const

interface ControlRow extends Record<string, unknown> {
  state: unknown
  indexing_ready: unknown
  revision: unknown
}

interface PolicyRow extends Record<string, unknown> {
  lifecycle_state: unknown
  indexing_enabled: unknown
  active_schema_version: unknown
  candidate_schema_version: unknown
  retiring_schema_versions: unknown
}

interface NamespaceRow extends Record<string, unknown> {
  namespace: unknown
}

interface SourceRow extends Record<string, unknown> {
  search_revision: unknown
  deleted_at: unknown
  content_hash: unknown
}

interface DeleteTargetRow extends Record<string, unknown> {
  schema_version: unknown
  vector_id: unknown
  namespace: unknown
}

export interface ExpandCrmSearchDirtySourceBatchInput {
  limit: number
  leaseSeconds: number
  now: string
  confirmationKeyring: CrmSearchConfirmationKeyring | null
}

export interface CrmSearchDirtyExpansionBatchResult {
  dirtyClaimed: number
  operationsCreated: number
  skippedByControl: number
}

export interface CrmSearchDirtyExpansionRepositoryDependencies {
  claimDirtySources(
    input: ClaimCrmSearchDirtySourcesInput
  ): Promise<CrmSearchDirtySourceClaim[]>
  transactionWithoutRetry: CrmSearchTransactionWithoutRetry
  deriveVectorId: typeof deriveCrmSearchVectorId
  createConfirmationTag(
    input: CreateCrmSearchConfirmationTagInput,
    keyring: CrmSearchConfirmationKeyring
  ): Promise<CrmSearchConfirmationTag>
  upsertOperation(
    input: UpsertCrmSearchOperationInput,
    transaction: CrmSearchTransactionClient
  ): Promise<CrmSearchOperation>
  completeDirtyClaim(
    input: Pick<CrmSearchDirtySourceClaim,
      'id' | 'sourceRevision' | 'eventSequence' | 'claimToken' | 'claimGeneration'>,
    transaction: CrmSearchTransactionClient
  ): Promise<boolean>
  releaseDirtyClaim(
    input: ReleaseCrmSearchDirtySourceClaimInput,
    transaction: CrmSearchTransactionClient
  ): Promise<boolean>
}

const defaultDependencies: CrmSearchDirtyExpansionRepositoryDependencies = {
  claimDirtySources: claimCrmSearchDirtySources,
  transactionWithoutRetry: crmSearchRepositoryDependencies.transactionWithoutRetry,
  deriveVectorId: deriveCrmSearchVectorId,
  createConfirmationTag: createCrmSearchConfirmationTag,
  upsertOperation: upsertCrmSearchOperation,
  completeDirtyClaim: completeCrmSearchDirtySourceClaim,
  releaseDirtyClaim: releaseCrmSearchDirtySourceClaim
}

function optionalSchema(value: unknown): string | null {
  return value === null || value === undefined ? null : requireSchemaVersion(value, errorCode)
}

function schemaList(policy: PolicyRow | null): {
  lifecycle: CrmSearchPolicyState | null
  indexingEnabled: boolean
  upsert: string[]
  deletion: string[]
} {
  if (!policy) return { lifecycle: null, indexingEnabled: false, upsert: [], deletion: [] }
  const lifecycle = requireEnum(policy.lifecycle_state, CRM_SEARCH_POLICY_STATES, errorCode)
  const indexingEnabled = requireBoolean(policy.indexing_enabled, errorCode)
  const active = optionalSchema(policy.active_schema_version)
  const candidate = optionalSchema(policy.candidate_schema_version)
  if (!Array.isArray(policy.retiring_schema_versions)) throw new Error(errorCode)
  const retiring = policy.retiring_schema_versions.map(value => requireSchemaVersion(value, errorCode))
  const unique = (values: Array<string | null>) => [...new Set(values.filter(
    (value): value is string => value !== null
  ))]
  const upsert = unique([active, candidate])
  const deletion = unique([active, candidate, ...retiring])
  if (
    upsert.length > CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS
    || deletion.length > CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS
  ) throw new Error(errorCode)
  return { lifecycle, indexingEnabled, upsert, deletion }
}

function providerId(value: unknown): string {
  return requireString(value, errorCode, {
    maximumLength: 64,
    pattern: /^[A-Za-z0-9_-]+$/
  })
}

function mapDeleteTarget(row: DeleteTargetRow) {
  return {
    schemaVersion: requireSchemaVersion(row.schema_version, errorCode),
    vectorId: providerId(row.vector_id),
    namespace: providerId(row.namespace)
  }
}

async function loadSource(
  claim: CrmSearchDirtySourceClaim,
  transaction: CrmSearchTransactionClient
): Promise<{ revision: number, deleted: boolean, contentHash: string } | null> {
  const params = [claim.clientId, claim.entityId]
  let sql: string
  if (claim.entityType === 'person') {
    sql = `
      SELECT search_revision, deleted_at,
        crm_search_person_projection_hash_v1(
          first_name, last_name, job_title, department,
          custom_fields->>'lifecycle_stage'
        ) AS content_hash
      FROM crm_people
      WHERE client_id = $1 AND id = $2
      FOR SHARE
    `
  } else if (claim.entityType === 'company') {
    sql = `
      SELECT search_revision, deleted_at,
        crm_search_company_projection_hash_v1(
          name, domain, custom_fields->>'lifecycle_stage'
        ) AS content_hash
      FROM crm_companies
      WHERE client_id = $1 AND id = $2
      FOR SHARE
    `
  } else {
    sql = `
      SELECT search_revision, deleted_at,
        crm_search_opportunity_projection_hash_v1(name, status, source) AS content_hash
      FROM crm_opportunities
      WHERE client_id = $1 AND id = $2
      FOR SHARE
    `
  }
  const row = firstRow<SourceRow>(await transaction.query<SourceRow>(sql, params))
  if (!row) return null
  return {
    revision: requireSafeInteger(row.search_revision, errorCode, { minimum: 1 }),
    deleted: row.deleted_at !== null,
    contentHash: requireDigest(row.content_hash, errorCode)
  }
}

async function loadDeleteTargets(
  claim: CrmSearchDirtySourceClaim,
  transaction: CrmSearchTransactionClient
): Promise<{
  targets: Map<string, { schemaVersion: string, vectorId: string, namespace: string }>
  hasActiveTeardown: boolean
}> {
  const params = [claim.organisationScopeId, claim.clientId, claim.entityType, claim.entityId]
  const documentRows = await transaction.query<DeleteTargetRow>(`
    SELECT schema_version, vector_id, namespace
    FROM crm_search_documents
    WHERE organisation_scope_id = $1
      AND client_id = $2
      AND entity_type = $3
      AND entity_id = $4
      AND confirmation_state <> 'deleted'
    ORDER BY schema_version, vector_id
    FOR SHARE
  `, params)
  const teardownRows = await transaction.query<DeleteTargetRow>(`
    SELECT vector.schema_version, vector.vector_id, vector.namespace
    FROM crm_search_teardown_vectors vector
    JOIN crm_search_client_teardowns teardown ON teardown.id = vector.teardown_id
    WHERE vector.organisation_scope_id = $1
      AND vector.client_id = $2
      AND vector.entity_type = $3
      AND vector.entity_id = $4
      AND vector.deletion_state <> 'confirmed_absent'
      AND teardown.state IN ('pending', 'deleting', 'provider_pending', 'failed')
    ORDER BY vector.schema_version, vector.vector_id
    FOR SHARE OF vector, teardown
  `, params)
  const targets = new Map<string, { schemaVersion: string, vectorId: string, namespace: string }>()
  for (const row of [...documentRows.rows, ...teardownRows.rows]) {
    const target = mapDeleteTarget(row)
    const previous = targets.get(target.schemaVersion)
    if (previous && (
      previous.vectorId !== target.vectorId || previous.namespace !== target.namespace
    )) throw new Error(errorCode)
    targets.set(target.schemaVersion, target)
  }
  if (targets.size > CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS) throw new Error(errorCode)
  return { targets, hasActiveTeardown: teardownRows.rows.length > 0 }
}

function nextAttemptAt(now: string): string {
  return new Date(Date.parse(now) + CRM_SEARCH_DIRTY_EXPANSION_RETRY_SECONDS * 1000)
    .toISOString()
}

async function release(
  claim: CrmSearchDirtySourceClaim,
  errorClass: string,
  now: string,
  transaction: CrmSearchTransactionClient,
  dependencies: CrmSearchDirtyExpansionRepositoryDependencies
) {
  return await dependencies.releaseDirtyClaim({
    id: claim.id,
    claimToken: claim.claimToken,
    claimGeneration: claim.claimGeneration,
    errorClass,
    nextAttemptAt: nextAttemptAt(now)
  }, transaction)
}

async function expandClaim(
  claim: CrmSearchDirtySourceClaim,
  input: ExpandCrmSearchDirtySourceBatchInput,
  dependencies: CrmSearchDirtyExpansionRepositoryDependencies
): Promise<{ operationsCreated: number, skippedByControl: number }> {
  return await dependencies.transactionWithoutRetry(async (transaction) => {
    await transaction.query(`
      SELECT pg_advisory_xact_lock_shared(
        crm_search_client_advisory_lock_key($1, $2)
      )
    `, [claim.organisationScopeId, claim.clientId])

    const control = firstRow<ControlRow>(await transaction.query<ControlRow>(`
      SELECT state, indexing_ready, revision
      FROM crm_search_global_control
      WHERE organisation_scope_id = $1
      FOR SHARE
    `, [claim.organisationScopeId]))
    if (!control) {
      await release(claim, 'control_disabled', input.now, transaction, dependencies)
      return { operationsCreated: 0, skippedByControl: 1 }
    }
    const globalState = requireEnum(control.state, globalStates, errorCode)
    const indexingReady = requireBoolean(control.indexing_ready, errorCode)
    requireSafeInteger(control.revision, errorCode)
    if (globalState === 'halted') {
      await release(claim, 'control_disabled', input.now, transaction, dependencies)
      return { operationsCreated: 0, skippedByControl: 1 }
    }

    const policy = firstRow<PolicyRow>(await transaction.query<PolicyRow>(`
      SELECT lifecycle_state, indexing_enabled, active_schema_version,
             candidate_schema_version, retiring_schema_versions
      FROM crm_search_policies
      WHERE organisation_scope_id = $1 AND client_id = $2
      FOR SHARE
    `, [claim.organisationScopeId, claim.clientId]))
    const schemas = schemaList(policy)
    const upsertAllowed = globalState === 'enabled'
      && indexingReady
      && schemas.indexingEnabled
      && schemas.lifecycle !== 'off'
      && schemas.lifecycle !== 'teardown_pending'

    if (claim.desiredAction === 'upsert' && !upsertAllowed) {
      await release(claim, 'control_disabled', input.now, transaction, dependencies)
      return { operationsCreated: 0, skippedByControl: 1 }
    }

    const namespaceRow = firstRow<NamespaceRow>(await transaction.query<NamespaceRow>(`
      SELECT namespace
      FROM crm_search_namespaces
      WHERE organisation_scope_id = $1 AND client_id = $2
      FOR SHARE
    `, [claim.organisationScopeId, claim.clientId]))
    const canonicalNamespace = namespaceRow ? providerId(namespaceRow.namespace) : null

    let action: 'upsert' | 'delete' = claim.desiredAction
    let contentHash: string | null = null
    if (action === 'upsert') {
      const source = await loadSource(claim, transaction)
      if (source && source.revision > claim.sourceRevision) {
        await release(claim, 'source_superseded', input.now, transaction, dependencies)
        return { operationsCreated: 0, skippedByControl: 0 }
      }
      if (!source || source.deleted || source.revision < claim.sourceRevision) {
        action = 'delete'
      } else {
        contentHash = source.contentHash
      }
    }

    const deletion = action === 'delete'
      ? await loadDeleteTargets(claim, transaction)
      : {
          targets: new Map<string, {
            schemaVersion: string
            vectorId: string
            namespace: string
          }>(),
          hasActiveTeardown: false
        }
    const targets = deletion.targets
    if (action === 'delete') {
      const ordinaryDeleteAllowed = globalState === 'enabled'
        && indexingReady
        && schemas.indexingEnabled
        && schemas.lifecycle !== 'off'
        && schemas.lifecycle !== 'teardown_pending'
      if (
        globalState !== 'delete_only'
        && !ordinaryDeleteAllowed
        && !deletion.hasActiveTeardown
      ) {
        await release(claim, 'control_disabled', input.now, transaction, dependencies)
        return { operationsCreated: 0, skippedByControl: 1 }
      }
    }
    const schemaVersions = action === 'upsert' ? schemas.upsert : schemas.deletion
    for (const schemaVersion of schemaVersions) {
      if (!targets.has(schemaVersion)) {
        if (!canonicalNamespace) continue
        targets.set(schemaVersion, {
          schemaVersion,
          vectorId: await dependencies.deriveVectorId({
            organisationScopeId: claim.organisationScopeId,
            clientId: claim.clientId,
            schemaVersion,
            entityType: claim.entityType,
            entityId: claim.entityId
          }),
          namespace: canonicalNamespace
        })
      }
    }
    if (targets.size > CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS) throw new Error(errorCode)

    if (action === 'upsert' && !input.confirmationKeyring) {
      await release(claim, 'confirmation_key_unavailable', input.now, transaction, dependencies)
      return { operationsCreated: 0, skippedByControl: 0 }
    }
    if (action === 'upsert' && (!canonicalNamespace || targets.size === 0)) {
      await release(claim, 'namespace_unavailable', input.now, transaction, dependencies)
      return { operationsCreated: 0, skippedByControl: 0 }
    }

    let operationsCreated = 0
    for (const target of targets.values()) {
      const confirmation = action === 'upsert'
        ? await dependencies.createConfirmationTag({
            organisationScopeId: claim.organisationScopeId,
            clientId: claim.clientId,
            vectorId: target.vectorId,
            schemaVersion: target.schemaVersion,
            sourceRevision: claim.sourceRevision,
            contentHash: contentHash!
          }, input.confirmationKeyring!)
        : null
      await dependencies.upsertOperation({
        organisationScopeId: claim.organisationScopeId,
        clientId: claim.clientId,
        entityType: claim.entityType,
        entityId: claim.entityId,
        schemaVersion: target.schemaVersion,
        sourceRevision: claim.sourceRevision,
        sourceEventSequence: claim.eventSequence,
        desiredAction: action,
        vectorId: target.vectorId,
        namespace: target.namespace,
        contentHash,
        confirmationTag: confirmation?.confirmationTag ?? null,
        confirmationKeyVersion: confirmation?.confirmationKeyVersion ?? null
      }, transaction)
      operationsCreated += 1
    }
    await dependencies.completeDirtyClaim(claim, transaction)
    return { operationsCreated, skippedByControl: 0 }
  })
}

export async function expandCrmSearchDirtySourceBatch(
  input: ExpandCrmSearchDirtySourceBatchInput,
  dependencies: CrmSearchDirtyExpansionRepositoryDependencies = defaultDependencies
): Promise<CrmSearchDirtyExpansionBatchResult> {
  const limit = requireSafeInteger(input.limit, errorCode, { minimum: 1, maximum: 100 })
  const leaseSeconds = requireSafeInteger(input.leaseSeconds, errorCode, {
    minimum: 1,
    maximum: 900
  })
  const now = requireTimestamp(input.now, errorCode)
  const confirmationKeyring = input.confirmationKeyring === null
    ? null
    : parseCrmSearchConfirmationKeyring(input.confirmationKeyring)
  if (input.confirmationKeyring !== null && !confirmationKeyring) throw new Error(errorCode)
  const validatedInput = { limit, leaseSeconds, now, confirmationKeyring }
  const claims = await dependencies.claimDirtySources({
    limit,
    leaseSeconds,
    now
  })
  if (!Array.isArray(claims) || claims.length > limit) throw new Error(errorCode)
  let operationsCreated = 0
  let skippedByControl = 0
  for (const claim of claims) {
    try {
      const result = await expandClaim(claim, validatedInput, dependencies)
      operationsCreated += result.operationsCreated
      skippedByControl += result.skippedByControl
    } catch {
      await dependencies.transactionWithoutRetry(async transaction => await release(
        claim,
        'expansion_failed',
        now,
        transaction,
        dependencies
      ))
    }
  }
  return { dirtyClaimed: claims.length, operationsCreated, skippedByControl }
}
