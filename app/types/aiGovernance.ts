export type AiDepartmentReadinessStatus
  = | 'ready_for_owner_confirmation'
    | 'draft_seeded'
    | 'released'
    | 'missing_department'
    | 'ambiguous_department'
    | 'missing_owner'
    | 'owner_inactive'
    | 'owner_not_member'

export interface AiDepartmentOwnerCandidate {
  id: string
  name: string
  source: 'department_member' | 'primary_department_assignment'
  membershipRole: 'lead' | 'senior' | 'member' | 'junior' | null
  isManager: boolean
  eligible: boolean
}

export interface AiDepartmentReadinessItem {
  key: string
  packKey: string
  name: string
  description: string
  status: AiDepartmentReadinessStatus
  releaseState: 'not_seeded' | 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
  blockers: string[]
  department: { id: string, name: string, slug: string } | null
  departmentMatches: Array<{ id: string, name: string, slug: string }>
  ownerCandidate: { id: string, name: string, source: 'department_manager' | 'catalog_owner' | 'department_member' } | null
  ownerCandidates: AiDepartmentOwnerCandidate[]
  coverage: { capabilities: number, tools: number, evaluationCases: number }
  knownGaps: string[]
}

export interface AiDepartmentReadinessResponse {
  summary: {
    total: number
    readyForOwnerConfirmation: number
    blocked: number
    missingDepartments: number
    draftSeeded: number
    released: number
  }
  items: AiDepartmentReadinessItem[]
  unmappedDepartments: Array<{ id: string, name: string, slug: string }>
}

export interface AiDepartmentDraftSeedInput {
  blueprintKey: string
  departmentId: string
  ownerUserId: string
  reason: string
}

export interface AiDepartmentDraftSeedResult {
  outcome: 'created' | 'already_exists'
  releaseState: 'draft'
  capabilityCount?: number
  evaluationCaseCount?: number
}

export type AiCatalogReleaseKind = 'pack' | 'capability'
export type AiCatalogReleaseState = 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'

export interface AiCatalogGovernanceItem {
  kind: AiCatalogReleaseKind
  id: string
  key: string
  name: string
  description: string
  department: { id: string, name: string, slug: string }
  owner: { id: string, name: string }
  version: { id: string, number: number, label: string | null }
  release: {
    id: string
    state: AiCatalogReleaseState
    rolloutScope: 'pilot' | 'department'
    evaluationRunId: string | null
    evaluationGatePassed: boolean | null
    reason: string
    changedBy: string
    createdAt: string
    updatedAt: string
  }
  evaluation: {
    runId: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    gatePassed: boolean | null
    caseCount: number
    passedCount: number
    failedCount: number
    humanReviewCount: number
  } | null
  controls: {
    modelFeatureKey: string
    permissionGroup: string | null
    riskClass: string | null
    dataClass: string | null
    approvalMode: string | null
    maxInputTokens: number
    maxOutputTokens: number
    maxCostUsdMicros: number
    maxLatencyMs: number
    capabilityCount: number
    toolCount: number
    toolNames: string[]
    toolsTruncated: boolean
  }
}

export interface AiEvaluationRunView {
  id: string
  departmentId: string
  materialIdentity: {
    evaluationSuiteVersionId: string
    packVersionId: string | null
    capabilityVersionId: string | null
    modelProvider: string
    modelId: string
    promptVersionDigest: string
    toolsetVersionDigest: string
  }
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  gatePassed: boolean | null
  caseCount: number
  passedCount: number
  failedCount: number
  humanReviewCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsdMicros: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface AiEvaluationCaseResultView {
  evaluationCaseId: string
  outcome: 'pass' | 'fail' | 'error' | 'human_review'
  score: number | null
  inputTokens: number
  outputTokens: number
  costUsdMicros: number
  latencyMs: number
}

export interface AiPilotMemberView {
  id: string
  releaseId: string
  kind: AiCatalogReleaseKind
  departmentId: string
  memberUserId: string
  memberName: string
  assignedAt: string
  eligible: boolean
}

export interface AiCompanyRolloutReadiness {
  readyForPilot: boolean
  readyForEnforcement: boolean
  activeEmployeeCount: number
  coveredEmployeeCount: number
  godMode: {
    activeOwnerCount: number
    emergencyDisabled: boolean
  }
  uncoveredEmployees: Array<{
    userId: string
    name: string
    role: string
    reasons: Array<'no_department' | 'no_mapped_pack' | 'no_evaluated_release'>
  }>
  departmentCoverage: Array<{
    departmentId: string
    name: string
    ownerReady: boolean
    releaseState: 'missing' | AiCatalogReleaseState
    latestGatePassed: boolean
    activeEmployeeCount: number
  }>
  blockers: string[]
}

export interface AiPilotReleaseMetrics {
  releaseId: string | null
  packKey: string
  cohort: 'account_production' | 'paid_media' | 'finance_bookkeeping'
  window: { from: string, to: string }
  eligibleUsers: number
  activeUsers: number
  successfulTurns: number
  failedTurns: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  totalCostUsdMicros: number
  usefulFeedbackRate: number | null
  ratingCount: number
  scopeViolationCount: number
  approvalBypassCount: number
  prohibitedEffectCount: number
  gate: 'insufficient_data' | 'pass' | 'fail'
  blockers: string[]
}

export interface AiPilotMetricsResponse {
  generatedAt: string
  window: { from: string, to: string }
  summary: {
    gate: 'insufficient_data' | 'pass' | 'fail'
    blockers: string[]
    requiredPackCount: number
    presentReleaseCount: number
  }
  metrics: AiPilotReleaseMetrics[]
}
