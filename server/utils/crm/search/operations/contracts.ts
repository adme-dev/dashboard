import {
  CRM_SEARCH_GLOBAL_STATES,
  CRM_SEARCH_POLICY_STATES,
  type CrmSearchGlobalState,
  type CrmSearchPolicyState
} from '~~/server/utils/crm/searchIndex/contracts'

export const CRM_SEARCH_CHANGE_APPROVAL_TYPES = [
  'resource_provision',
  'production_migration',
  'production_deploy',
  'client_indexing',
  'client_shadow',
  'client_assist'
] as const

export const CRM_SEARCH_ORDINARY_CHANGE_APPROVAL_TYPES = [
  'production_migration',
  'production_deploy',
  'client_indexing',
  'client_shadow',
  'client_assist'
] as const

export type CrmSearchChangeApprovalType = typeof CRM_SEARCH_CHANGE_APPROVAL_TYPES[number]
export type CrmSearchApprovalScope = 'global' | 'client'

export interface CrmSearchAdminActor {
  actorId: string
  orgId: string
  permissions: readonly string[]
  authorityRevision: string
}

export interface CrmSearchApprovalDraft extends Record<string, unknown> {
  approvalType: CrmSearchChangeApprovalType
  environment: 'preview' | 'production'
  organisationScopeId: string
  implementationGitSha: string
  artifactManifestDigest: string
  pagesBundleDigest?: string
  workerBundleDigest?: string
  bindingManifestDigest: string
  evidenceBundleHash: string
  maximumCostUsdMicros: number
  approvedBy: string
  requestedByActorId: string
  reason: string
  issuedAt?: string
  expiresAt: string
  importedProvenanceHash?: string
  clientId?: string
  loadProtocolDigest?: string
  providerContractDigest?: string
  rateCardId?: string
  expectedControlRevision?: number
  expectedPolicyRevision?: number
  expectedDeploymentApprovalId?: string
  targetSchemaVersion?: string
  requestedAction?: string
  activeVectorCount?: number
  candidateVectorCount?: number
  retiringVectorCount?: number
  sentinelVectorCount?: number
  deletionPendingVectorCount?: number
  forecastVectorCount?: number
  vectorCapacity?: number
  activeNamespaceCount?: number
  candidateNamespaceCount?: number
  retiringNamespaceCount?: number
  sentinelNamespaceCount?: number
  deletionPendingNamespaceCount?: number
  forecastNamespaceCount?: number
  namespaceCapacity?: number
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const digestPattern = /^[a-f0-9]{64}$/u
const gitShaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u
const schemaPattern = /^crm-search-v[1-9][0-9]*$/u
const clientTypes = new Set<CrmSearchChangeApprovalType>(['client_indexing', 'client_shadow', 'client_assist'])

function invalid(code = 'crm_search_invalid_approval'): never {
  throw new Error(code)
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.length || (pattern && !pattern.test(value))) invalid()
  return value
}

function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid()
  return value as number
}

function requireClientEvidence(input: Record<string, unknown>) {
  for (const key of [
    'clientId', 'pagesBundleDigest', 'workerBundleDigest', 'loadProtocolDigest',
    'providerContractDigest', 'rateCardId', 'expectedDeploymentApprovalId'
  ]) string(input[key], key.endsWith('Id') ? uuidPattern : digestPattern)
  integer(input.expectedControlRevision)
  integer(input.expectedPolicyRevision)
}

function requireProductionDeploymentEvidence(input: Record<string, unknown>) {
  string(input.pagesBundleDigest, digestPattern)
  string(input.workerBundleDigest, digestPattern)
  string(input.rateCardId, uuidPattern)
  integer(input.expectedControlRevision)
}

function requireIndexingCapacity(input: Record<string, unknown>) {
  string(input.targetSchemaVersion, schemaPattern)
  if (!['enable_indexing', 'restore_indexing_readiness', 'policy_indexing', 'configure_candidate',
    'promote_candidate', 'retire_schema'].includes(String(input.requestedAction))) invalid()
  const vectorParts = [
    'activeVectorCount', 'candidateVectorCount', 'retiringVectorCount',
    'sentinelVectorCount', 'deletionPendingVectorCount'
  ].map(key => integer(input[key]))
  const namespaceParts = [
    'activeNamespaceCount', 'candidateNamespaceCount', 'retiringNamespaceCount',
    'sentinelNamespaceCount', 'deletionPendingNamespaceCount'
  ].map(key => integer(input[key]))
  const forecastVectors = integer(input.forecastVectorCount)
  const vectorCapacity = integer(input.vectorCapacity, 1)
  const forecastNamespaces = integer(input.forecastNamespaceCount)
  const namespaceCapacity = integer(input.namespaceCapacity, 1)
  const exactForecast = forecastVectors === vectorParts.reduce((sum, value) => sum + value, 0)
    && forecastNamespaces === namespaceParts.reduce((sum, value) => sum + value, 0)
  if (!exactForecast || forecastVectors * 5 >= vectorCapacity * 4
    || forecastNamespaces * 5 >= namespaceCapacity * 4) {
    invalid('crm_search_capacity_approval_blocked')
  }
}

export function crmSearchApprovalScope(type: CrmSearchChangeApprovalType): CrmSearchApprovalScope {
  if (!CRM_SEARCH_CHANGE_APPROVAL_TYPES.includes(type)) invalid()
  return clientTypes.has(type) ? 'client' : 'global'
}

export function parseCrmSearchApprovalDraft(value: unknown): CrmSearchApprovalDraft {
  const input = record(value)
  const approvalType = string(input.approvalType) as CrmSearchChangeApprovalType
  if (!CRM_SEARCH_CHANGE_APPROVAL_TYPES.includes(approvalType)) invalid()
  if (!['preview', 'production'].includes(String(input.environment))) invalid()
  string(input.organisationScopeId, uuidPattern)
  string(input.implementationGitSha, gitShaPattern)
  string(input.artifactManifestDigest, digestPattern)
  string(input.bindingManifestDigest, digestPattern)
  string(input.evidenceBundleHash, digestPattern)
  integer(input.maximumCostUsdMicros)
  const approvedBy = string(input.approvedBy, uuidPattern)
  const requestedBy = string(input.requestedByActorId, uuidPattern)
  if (approvedBy === requestedBy) invalid('crm_search_approval_actor_separation_required')
  const reason = string(input.reason).trim()
  if (reason.length < 10 || reason.length > 2_000) invalid()
  const expiresAt = string(input.expiresAt)
  if (!Number.isFinite(Date.parse(expiresAt))) invalid()
  if (input.issuedAt !== undefined && !Number.isFinite(Date.parse(string(input.issuedAt)))) invalid()

  if (crmSearchApprovalScope(approvalType) === 'client') requireClientEvidence(input)
  else if (input.clientId != null) invalid()
  if (approvalType === 'production_deploy') requireProductionDeploymentEvidence(input)
  if (approvalType === 'client_indexing') requireIndexingCapacity(input)
  if (approvalType === 'resource_provision') {
    string(input.importedProvenanceHash, digestPattern)
  } else if (input.importedProvenanceHash !== undefined) {
    string(input.importedProvenanceHash, digestPattern)
  }

  return Object.freeze({ ...input, approvalType, reason }) as CrmSearchApprovalDraft
}

export function requireGlobalState(value: unknown): CrmSearchGlobalState {
  if (typeof value !== 'string' || !CRM_SEARCH_GLOBAL_STATES.includes(value as CrmSearchGlobalState)) {
    throw new Error('crm_search_invalid_global_state')
  }
  return value as CrmSearchGlobalState
}

export function requirePolicyState(value: unknown): CrmSearchPolicyState {
  if (typeof value !== 'string' || !CRM_SEARCH_POLICY_STATES.includes(value as CrmSearchPolicyState)) {
    throw new Error('crm_search_invalid_policy_state')
  }
  return value as CrmSearchPolicyState
}
