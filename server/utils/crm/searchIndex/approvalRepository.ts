import {
  crmSearchRepositoryError,
  firstRow,
  requireDigest,
  requireEnum,
  requireOptionalUuid,
  requireSafeInteger,
  requireSchemaVersion,
  requireString,
  requireTimestamp,
  requireUuid,
  type CrmSearchTransactionClient
} from './repository'

const errorCode = 'crm_search_approval_mismatch'
const approvalTypes = [
  'resource_provision',
  'production_migration',
  'production_deploy',
  'client_indexing',
  'client_shadow',
  'client_assist'
] as const
const environments = ['preview', 'production'] as const
const scopeKinds = ['global', 'client'] as const

export interface RequireCrmSearchApprovalInput {
  approvalId: string
  approvalType: typeof approvalTypes[number]
  environment: typeof environments[number]
  organisationScopeId: string
  scopeKind: typeof scopeKinds[number]
  clientId: string | null
  implementationGitSha: string
  artifactManifestDigest: string
  pagesBundleDigest: string
  workerBundleDigest: string
  bindingManifestDigest: string
  evidenceBundleHash: string
  expectedControlRevision: number
  expectedPolicyRevision: number | null
  expectedDeploymentApprovalId: string | null
  targetSchemaVersion: string
  requestedAction: string
  maximumCostUsdMicros: number
  transitionActorId: string
  now: string
}

export interface CrmSearchApproval {
  id: string
  approvedBy: string
  issuedAt: string
  expiresAt: string
  maximumCostUsdMicros: number
}

function equalNullable(left: unknown, right: string | number | null, integer = false): boolean {
  if (right === null) return left === null
  if (integer) {
    try {
      return requireSafeInteger(left, errorCode) === right
    } catch {
      return false
    }
  }
  return left === right
}

export async function requireCrmSearchApproval(
  required: RequireCrmSearchApprovalInput,
  transaction: CrmSearchTransactionClient
): Promise<CrmSearchApproval> {
  try {
    const approvalId = requireUuid(required.approvalId, errorCode)
    const approvalType = requireEnum(required.approvalType, approvalTypes, errorCode)
    const environment = requireEnum(required.environment, environments, errorCode)
    const organisationScopeId = requireUuid(required.organisationScopeId, errorCode)
    const scopeKind = requireEnum(required.scopeKind, scopeKinds, errorCode)
    const clientId = requireOptionalUuid(required.clientId, errorCode)
    const implementationGitSha = requireString(required.implementationGitSha, errorCode, {
      minimumLength: 40,
      maximumLength: 64,
      pattern: /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
    })
    const artifactManifestDigest = requireDigest(required.artifactManifestDigest, errorCode)
    const pagesBundleDigest = requireDigest(required.pagesBundleDigest, errorCode)
    const workerBundleDigest = requireDigest(required.workerBundleDigest, errorCode)
    const bindingManifestDigest = requireDigest(required.bindingManifestDigest, errorCode)
    const evidenceBundleHash = requireDigest(required.evidenceBundleHash, errorCode)
    const expectedControlRevision = requireSafeInteger(required.expectedControlRevision, errorCode)
    const expectedPolicyRevision = required.expectedPolicyRevision === null
      ? null
      : requireSafeInteger(required.expectedPolicyRevision, errorCode)
    const expectedDeploymentApprovalId = requireOptionalUuid(
      required.expectedDeploymentApprovalId,
      errorCode
    )
    const targetSchemaVersion = requireSchemaVersion(required.targetSchemaVersion, errorCode)
    const requestedAction = requireString(required.requestedAction, errorCode, {
      maximumLength: 120,
      pattern: /^[a-z][a-z0-9_]{1,119}$/
    })
    const maximumCostUsdMicros = requireSafeInteger(required.maximumCostUsdMicros, errorCode)
    const transitionActorId = requireUuid(required.transitionActorId, errorCode)
    const now = requireTimestamp(required.now, errorCode)
    if ((scopeKind === 'client') !== (clientId !== null)) throw crmSearchRepositoryError(errorCode)

    const row = firstRow(await transaction.query(`
      SELECT
        approval.*,
        revocation.revoked_at,
        consumption.consumed_at
      FROM crm_search_change_approvals approval
      LEFT JOIN crm_search_change_approval_revocations revocation
        ON revocation.approval_id = approval.id
      LEFT JOIN crm_search_change_approval_consumptions consumption
        ON consumption.approval_id = approval.id
      WHERE approval.id = $1
      FOR UPDATE OF approval
    `, [approvalId]))
    if (!row) throw crmSearchRepositoryError(errorCode)

    const approvedBy = requireUuid(row.approved_by, errorCode)
    const issuedAt = requireTimestamp(row.issued_at, errorCode)
    const expiresAt = requireTimestamp(row.expires_at, errorCode)
    const storedMaximum = requireSafeInteger(row.maximum_cost_usd_micros, errorCode)
    const exact = row.id === approvalId
      && row.approval_type === approvalType
      && row.environment === environment
      && row.organisation_scope_id === organisationScopeId
      && row.scope_kind === scopeKind
      && row.client_id === clientId
      && row.implementation_git_sha === implementationGitSha
      && row.artifact_manifest_digest === artifactManifestDigest
      && row.pages_bundle_digest === pagesBundleDigest
      && row.worker_bundle_digest === workerBundleDigest
      && row.binding_manifest_digest === bindingManifestDigest
      && row.evidence_bundle_hash === evidenceBundleHash
      && equalNullable(row.expected_control_revision, expectedControlRevision, true)
      && equalNullable(row.expected_policy_revision, expectedPolicyRevision, true)
      && equalNullable(row.expected_deployment_approval_id, expectedDeploymentApprovalId)
      && row.target_schema_version === targetSchemaVersion
      && row.requested_action === requestedAction
      && storedMaximum === maximumCostUsdMicros
      && approvedBy !== transitionActorId
      && issuedAt <= now
      && expiresAt > now
      && row.revoked_at === null
      && row.consumed_at === null
    if (!exact) throw crmSearchRepositoryError(errorCode)

    return { id: approvalId, approvedBy, issuedAt, expiresAt, maximumCostUsdMicros: storedMaximum }
  } catch {
    throw crmSearchRepositoryError(errorCode)
  }
}
