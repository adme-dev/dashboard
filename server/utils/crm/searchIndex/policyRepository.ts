import {
  CRM_SEARCH_GLOBAL_STATES,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_POLICY_STATES,
  CRM_SEARCH_PROVIDER_ACTIONS,
  CRM_SEARCH_SURFACES,
  type CrmSearchGlobalState,
  type CrmSearchMode,
  type CrmSearchProviderAction,
  type CrmSearchSchemaRole,
  type CrmSearchSurface
} from './contracts'
import {
  isCrmSearchProviderActionAllowed,
  resolveEffectiveCrmSearchMode,
  resolvePolicyStateMode
} from './policy'
import {
  crmSearchRepositoryDependencies,
  crmSearchRepositoryError,
  firstRow,
  requireBoolean,
  requireEnum,
  requireOptionalTimestamp,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchQueryOneFresh,
  type CrmSearchTransactionClient
} from './repository'

const failureCode = 'crm_search_provider_disabled'

interface PolicySnapshotRow extends Record<string, unknown> {
  organisation_scope_id: unknown
  client_id: unknown
  global_state: unknown
  maximum_mode: unknown
  indexing_ready: unknown
  control_revision: unknown
  lifecycle_state: unknown
  effective_mode: unknown
  indexing_enabled: unknown
  policy_revision: unknown
  active_schema_version: unknown
  schema_metadata_index_state: unknown
  schema_sentinel_state: unknown
  rate_card_id: unknown
  rate_card_revision: unknown
  rate_card_model_id: unknown
  rate_card_valid_from: unknown
  rate_card_valid_until: unknown
  rate_card_revoked_at: unknown
}

export interface LoadCrmSearchPolicySnapshotInput {
  organisationScopeId: string
  clientId: string
  surface: CrmSearchSurface
  infrastructureReady: boolean
  now: string
}

export interface CrmSearchPolicySnapshot {
  effectiveMode: CrmSearchMode
  providerEnabled: boolean
  globalState: CrmSearchGlobalState | null
  controlRevision: number | null
  policyRevision: number | null
  activeSchemaVersion: string | null
}

export interface PolicyRepositoryReadDependencies {
  queryOneFresh?: CrmSearchQueryOneFresh
}

function offSnapshot(): CrmSearchPolicySnapshot {
  return {
    effectiveMode: 'off',
    providerEnabled: false,
    globalState: null,
    controlRevision: null,
    policyRevision: null,
    activeSchemaVersion: null
  }
}

export async function loadCrmSearchPolicySnapshot(
  input: LoadCrmSearchPolicySnapshotInput,
  dependencies: PolicyRepositoryReadDependencies = {}
): Promise<CrmSearchPolicySnapshot> {
  try {
    const organisationScopeId = requireUuid(input.organisationScopeId, failureCode)
    const clientId = requireUuid(input.clientId, failureCode)
    const surface = requireEnum(input.surface, CRM_SEARCH_SURFACES, failureCode)
    const now = requireTimestamp(input.now, failureCode)
    if (input.infrastructureReady !== true) return offSnapshot()

    const read = dependencies.queryOneFresh ?? crmSearchRepositoryDependencies.queryOneFresh
    const row = await read<PolicySnapshotRow>(`
      SELECT
        control.organisation_scope_id,
        policy.client_id,
        control.state AS global_state,
        control.maximum_mode,
        control.indexing_ready,
        control.revision AS control_revision,
        policy.lifecycle_state,
        policy.effective_mode,
        policy.indexing_enabled,
        policy.revision AS policy_revision,
        policy.active_schema_version,
        schema.metadata_index_state AS schema_metadata_index_state,
        schema.sentinel_state AS schema_sentinel_state,
        rate_card.id AS rate_card_id,
        rate_card.revision AS rate_card_revision,
        rate_card.model_id AS rate_card_model_id,
        rate_card.valid_from AS rate_card_valid_from,
        rate_card.valid_until AS rate_card_valid_until,
        revocation.revoked_at AS rate_card_revoked_at
      FROM crm_search_global_control control
      JOIN crm_search_policies policy
        ON policy.organisation_scope_id = control.organisation_scope_id
       AND policy.client_id = $2
      LEFT JOIN crm_search_schema_versions schema
        ON schema.organisation_scope_id = control.organisation_scope_id
       AND schema.schema_version = policy.active_schema_version
      LEFT JOIN crm_search_rate_cards rate_card
        ON rate_card.id = policy.rate_card_id
       AND rate_card.id = control.rate_card_id
      LEFT JOIN crm_search_rate_card_revocations revocation
        ON revocation.rate_card_id = rate_card.id
      WHERE control.organisation_scope_id = $1
        AND rate_card.valid_from <= $3::TIMESTAMPTZ
        AND rate_card.valid_until > $3::TIMESTAMPTZ
    `, [organisationScopeId, clientId, now])
    if (!row) return offSnapshot()

    const globalState = requireEnum(row.global_state, CRM_SEARCH_GLOBAL_STATES, failureCode)
    const maximumMode = requireEnum(row.maximum_mode, ['off', 'shadow', 'assist'] as const, failureCode)
    const lifecycleState = requireEnum(row.lifecycle_state, CRM_SEARCH_POLICY_STATES, failureCode)
    const persistedMode = requireEnum(row.effective_mode, ['off', 'shadow', 'assist'] as const, failureCode)
    const indexingReady = requireBoolean(row.indexing_ready, failureCode)
    const indexingEnabled = requireBoolean(row.indexing_enabled, failureCode)
    const controlRevision = requireSafeInteger(row.control_revision, failureCode)
    const policyRevision = requireSafeInteger(row.policy_revision, failureCode)
    const activeSchemaVersion = requireSchemaVersion(row.active_schema_version, failureCode)
    if (requireUuid(row.organisation_scope_id, failureCode) !== organisationScopeId
      || requireUuid(row.client_id, failureCode) !== clientId) return offSnapshot()
    requireUuid(row.rate_card_id, failureCode)
    requireString(row.rate_card_revision, failureCode, { maximumLength: 120 })
    if (row.rate_card_model_id !== CRM_SEARCH_MODEL_ID) return offSnapshot()
    const validFrom = requireTimestamp(row.rate_card_valid_from, failureCode)
    const validUntil = requireTimestamp(row.rate_card_valid_until, failureCode)
    const revokedAt = requireOptionalTimestamp(row.rate_card_revoked_at, failureCode)
    const metadataReady = row.schema_metadata_index_state === 'ready'
    const sentinelReady = row.schema_sentinel_state === 'confirmed_absent'
    const rateCurrent = revokedAt === null && now >= validFrom && now < validUntil
    const stateMode = resolvePolicyStateMode(lifecycleState)
    if (persistedMode !== stateMode || !indexingReady || !indexingEnabled
      || !metadataReady || !sentinelReady || !rateCurrent) return offSnapshot()

    const effectiveMode = resolveEffectiveCrmSearchMode({
      globalState,
      globalMaximum: maximumMode,
      policyMode: persistedMode,
      surface,
      infrastructureReady: true
    })
    return {
      effectiveMode,
      providerEnabled: effectiveMode !== 'off',
      globalState,
      controlRevision,
      policyRevision,
      activeSchemaVersion
    }
  } catch {
    return offSnapshot()
  }
}

export interface RequireCrmSearchProviderAuthorityInput {
  organisationScopeId: string
  clientId: string
  action: CrmSearchProviderAction
  schemaVersion: string
  infrastructureReady: boolean
  teardownId?: string
}

export interface CrmSearchProviderAuthority {
  controlRevision: number
  policyRevision: number | null
  schemaRole: CrmSearchSchemaRole
  teardownId: string | null
}

export async function requireCrmSearchProviderAuthority(
  input: RequireCrmSearchProviderAuthorityInput,
  transaction: CrmSearchTransactionClient
): Promise<CrmSearchProviderAuthority> {
  try {
    const organisationScopeId = requireUuid(input.organisationScopeId, failureCode)
    const clientId = requireUuid(input.clientId, failureCode)
    const action = requireEnum(input.action, CRM_SEARCH_PROVIDER_ACTIONS, failureCode)
    const schemaVersion = requireSchemaVersion(input.schemaVersion, failureCode)
    if (input.infrastructureReady !== true) throw crmSearchRepositoryError(failureCode)

    const control = firstRow(await transaction.query(`
      SELECT state, indexing_ready, revision
      FROM crm_search_global_control
      WHERE organisation_scope_id = $1
      FOR SHARE
    `, [organisationScopeId]))
    if (!control) throw crmSearchRepositoryError(failureCode)
    const globalState = requireEnum(control.state, CRM_SEARCH_GLOBAL_STATES, failureCode)
    const indexingReady = requireBoolean(control.indexing_ready, failureCode)
    const controlRevision = requireSafeInteger(control.revision, failureCode)

    const policy = firstRow(await transaction.query(`
      SELECT lifecycle_state, indexing_enabled, revision, active_schema_version,
             candidate_schema_version, retiring_schema_versions
      FROM crm_search_policies
      WHERE organisation_scope_id = $1 AND client_id = $2
      FOR SHARE
    `, [organisationScopeId, clientId]))

    if (action === 'delete' && input.teardownId) {
      const teardownId = requireUuid(input.teardownId, failureCode)
      const teardown = firstRow(await transaction.query(`
        SELECT id, state, provider_deletion_state
        FROM crm_search_client_teardowns
        WHERE id = $1
          AND organisation_scope_id = $2
          AND client_id = $3
        FOR SHARE
      `, [teardownId, organisationScopeId, clientId]))
      const authorized = teardown?.id === teardownId
        && ['deleting', 'provider_pending'].includes(String(teardown.state))
        && ['pending', 'partially_confirmed'].includes(String(teardown.provider_deletion_state))
      if (!authorized || (globalState !== 'enabled' && globalState !== 'delete_only')) {
        throw crmSearchRepositoryError(failureCode)
      }
      return { controlRevision, policyRevision: null, schemaRole: 'retiring', teardownId }
    }

    if (!policy) throw crmSearchRepositoryError(failureCode)
    const policyState = requireEnum(policy.lifecycle_state, CRM_SEARCH_POLICY_STATES, failureCode)
    const indexingEnabled = requireBoolean(policy.indexing_enabled, failureCode)
    const policyRevision = requireSafeInteger(policy.revision, failureCode)
    const active = policy.active_schema_version === null
      ? null
      : requireSchemaVersion(policy.active_schema_version, failureCode)
    const candidate = policy.candidate_schema_version === null
      ? null
      : requireSchemaVersion(policy.candidate_schema_version, failureCode)
    if (!Array.isArray(policy.retiring_schema_versions)
      || !policy.retiring_schema_versions.every(value => typeof value === 'string')) {
      throw crmSearchRepositoryError(failureCode)
    }
    const retiring = policy.retiring_schema_versions as string[]
    const schemaRole: CrmSearchSchemaRole | null = schemaVersion === active
      ? 'active'
      : schemaVersion === candidate
        ? 'candidate'
        : retiring.includes(schemaVersion)
          ? 'retiring'
          : null
    if (!schemaRole) throw crmSearchRepositoryError(failureCode)

    const schema = firstRow(await transaction.query(`
      SELECT metadata_index_state, sentinel_state
      FROM crm_search_schema_versions
      WHERE organisation_scope_id = $1 AND schema_version = $2
      FOR SHARE
    `, [organisationScopeId, schemaVersion]))
    if (!schema
      || !['pending', 'ready', 'failed'].includes(String(schema.metadata_index_state))
      || !['pending', 'upsert_pending', 'query_verified', 'delete_pending',
        'confirmed_absent', 'failed'].includes(String(schema.sentinel_state))) {
      throw crmSearchRepositoryError(failureCode)
    }
    const schemaReady = action === 'delete'
      || (schema.metadata_index_state === 'ready' && schema.sentinel_state === 'confirmed_absent')
    if (!schemaReady || !indexingReady || !indexingEnabled
      || !isCrmSearchProviderActionAllowed({
        globalState,
        policyState,
        action,
        schemaRole,
        infrastructureReady: true,
        teardownAuthorized: false
      })) throw crmSearchRepositoryError(failureCode)

    return { controlRevision, policyRevision, schemaRole, teardownId: null }
  } catch {
    throw crmSearchRepositoryError(failureCode)
  }
}
