export const CRM_SEARCH_CHANGE_APPROVAL_TYPES = [
  'resource_provision',
  'production_migration',
  'production_deploy',
  'client_indexing',
  'client_shadow',
  'client_assist'
] as const

export type CrmSearchChangeApprovalType = typeof CRM_SEARCH_CHANGE_APPROVAL_TYPES[number]
export type CrmSearchGlobalState = 'halted' | 'delete_only' | 'enabled'
export type CrmSearchPolicyState = 'off' | 'indexing' | 'shadow' | 'assist' | 'teardown_pending'

export interface CrmSearchHealthView {
  global: { state: CrmSearchGlobalState, revision: number, maximumMode: 'off' | 'shadow' | 'assist', indexingReady: boolean }
  counts: { dirty: number, pending: number, providerPending: number, retryable: number, deadLetters: number }
  capacity: { level: 'ok' | 'warning' | 'page' | 'blocked', blockNewIndexing: boolean, usedBasisPoints: number }
  oldestAgeSeconds: { dirty: number | null, operation: number | null, queue: number | null }
  schema: Array<{ version: string, role: 'active' | 'candidate' | 'retiring', confirmedVectors: number }>
  dependency: Array<{
    name: string
    status: 'ok' | 'degraded' | 'down'
    evidence?: Record<string, number | boolean | null>
  }>
  freshness: { staleClients: number, sourceHighWatermarkLag: number, p95RevisionLag: number | null }
  cost: { globalBudgetUsedBasisPoints: number, clientsNearBudget: number, configuredGlobalBudgetUsdMicros: number, budgetState: 'disabled' | 'configured' }
  fallbacks: Record<string, number>
  security: { crossScopeCandidateRejections: number }
  alerts: Array<{ signal: string, action: 'alert' | 'dashboard' }>
}

export interface CrmSearchPolicyView {
  clientId: string
  clientName: string
  state: CrmSearchPolicyState
  mode: 'off' | 'shadow' | 'assist'
  indexingEnabled: boolean
  revision: string
  controlRevision: number
  activeSchemaVersion: string | null
  candidateSchemaVersion: string | null
  evaluationRunId: string | null
}

export interface CrmSearchDeadLetterView {
  id: string
  operationId: string
  clientId: string
  origin: 'cloudflare_transport' | 'provider_confirmation'
  resolutionState: string
  attempts: number
  errorClass: string
  lastFailedAt: string
  revision: string
  generation: number
}

export interface CrmSearchApprovalView {
  id: string
  approvalType: CrmSearchChangeApprovalType
  environment: 'preview' | 'production'
  scopeKind: 'global' | 'client'
  clientId: string | null
  reason: string
  organisationScopeId: string
  implementationGitSha: string
  artifactManifestDigest: string
  pagesBundleDigest: string | null
  workerBundleDigest: string | null
  bindingManifestDigest: string
  evidenceBundleHash: string
  loadProtocolDigest: string | null
  providerContractDigest: string | null
  rateCardId: string | null
  maximumCostUsdMicros: number
  activeVectorCount: number | null
  candidateVectorCount: number | null
  retiringVectorCount: number | null
  sentinelVectorCount: number | null
  deletionPendingVectorCount: number | null
  forecastVectorCount: number | null
  vectorCapacity: number | null
  activeNamespaceCount: number | null
  candidateNamespaceCount: number | null
  retiringNamespaceCount: number | null
  sentinelNamespaceCount: number | null
  deletionPendingNamespaceCount: number | null
  forecastNamespaceCount: number | null
  namespaceCapacity: number | null
  expectedControlRevision: number | null
  expectedPolicyRevision: number | null
  expectedDeploymentApprovalId: string | null
  targetSchemaVersion: string | null
  requestedAction: string | null
  issuedAt: string
  expiresAt: string
  approvedBy: string
  requestedByActorId: string | null
  importedProvenanceHash: string | null
  revision: number
  revokedAt: string | null
  consumedAt: string | null
}

export interface CrmSearchTelemetryView {
  date: string
  mode: string
  surface: string
  statusClass: string
  requestCount: number
  fallbackCount: number
  timeoutCount: number
  lateBilledCompletionCount: number
  latencyCount: number
  latencySumMs: number
  latencyMaxMs: number
}

export interface CrmSearchOperationError {
  data?: {
    code?: string
    action?: string
    statusMessage?: string
    data?: { code?: string, action?: string, statusMessage?: string }
  }
}
