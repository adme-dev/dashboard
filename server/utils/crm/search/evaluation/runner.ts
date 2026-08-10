import type { H3Event } from 'h3'
import { validateEvaluationFixtureBundle } from './fixtures'
import { computeGranularQueryRankingMetrics } from './metrics'
import type {
  CrmSearchEvaluationRecordInput,
  CrmSearchEvaluationRunRecord
} from './repository'
import { recordCrmSearchEvaluationRun } from './repository'
import {
  resolveCrmSearchSealedArtifactProvider,
  unsealCrmSearchHoldout
} from './sealedArtifact'

const requestKeys = new Set([
  'fixtureVersion', 'sealedArtifactId', 'implementationGitSha', 'schemaVersion',
  'requestedBy', 'organisationScopeId', 'datasetSha256', 'sealedJudgementSha256',
  'preregistrationSha256', 'adjudicationSha256', 'artifactManifestDigest',
  'pagesBundleDigest', 'workerBundleDigest', 'bindingManifestDigest', 'modelId',
  'tokenizerRevision', 'documentBuilderRevision', 'rankingRevision',
  'thresholdRevision', 'providerContractDigest', 'environment',
  'loadProtocolDigest', 'rateCardId', 'previewPagesDeploymentId',
  'previewWorkerDeploymentId', 'reason'
])

export interface CrmSearchEvaluationRunnerDependencies {
  loadCheckedInFixtures(): Promise<Record<string, unknown>>
  freezePreregistration(fixtures: Record<string, unknown>): Promise<Record<string, unknown>>
  unsealHoldout(input: {
    artifactId: string
    expectedSealedJudgementSha256: string | null
  }): Promise<Record<string, unknown>>
  executeGranularQueries(input: {
    request: Record<string, unknown>
    fixtures: Record<string, unknown>
    holdout: Record<string, unknown>
  }): Promise<unknown[]>
  recordEvaluationRun(input: Record<string, unknown>): Promise<CrmSearchEvaluationRunRecord>
}

export class CrmSearchEvaluationRunnerError extends Error {
  readonly code: string

  constructor(code = 'crm_search_evaluation_failed') {
    super(code === 'crm_search_evaluation_caller_submitted_evidence'
      ? 'Caller-submitted CRM search evaluation evidence is forbidden'
      : 'CRM search evaluation could not be completed')
    this.name = 'CrmSearchEvaluationRunnerError'
    this.code = code
  }
}

function validateRequest(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_invalid_request')
  }
  const request = value as Record<string, unknown>
  if (Object.keys(request).some(key => !requestKeys.has(key))) {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_caller_submitted_evidence')
  }
  for (const key of ['fixtureVersion', 'sealedArtifactId', 'implementationGitSha', 'schemaVersion', 'requestedBy']) {
    if (typeof request[key] !== 'string' || !(request[key] as string).trim()) {
      throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_invalid_request')
    }
  }
  return request
}

function numberFromFixture(fixtures: Record<string, unknown>, key: string): number {
  const direct = fixtures[key]
  if (typeof direct === 'number' && Number.isInteger(direct)) return direct
  const development = fixtures.development
  if (key === 'developmentQueryCount' && development && typeof development === 'object') {
    const queries = (development as { queries?: unknown }).queries
    if (Array.isArray(queries)) return queries.length
  }
  throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_fixture_invalid')
}

export async function runCrmSearchEvaluation(
  input: unknown,
  dependencies: CrmSearchEvaluationRunnerDependencies
): Promise<CrmSearchEvaluationRunRecord> {
  const request = validateRequest(input)
  const fixtures = await dependencies.loadCheckedInFixtures()
  const frozen = await dependencies.freezePreregistration(fixtures)
  if (typeof frozen.frozenAt !== 'string' || typeof frozen.sha256 !== 'string') {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_preregistration_not_frozen')
  }
  const holdout = await dependencies.unsealHoldout({
    artifactId: request.sealedArtifactId as string,
    expectedSealedJudgementSha256: typeof request.sealedJudgementSha256 === 'string'
      ? request.sealedJudgementSha256
      : null
  })
  const queryEvidence = await dependencies.executeGranularQueries({ request, fixtures, holdout })
  if (!Array.isArray(queryEvidence)) {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_granular_evidence_missing')
  }

  const persisted: Record<string, unknown> = {
    ...request,
    runnerId: request.requestedBy,
    developmentQueryCount: numberFromFixture(fixtures, 'developmentQueryCount'),
    queryEvidence,
    preregistrationSha256: frozen.sha256,
    sealedJudgementSha256: holdout.sealedJudgementSha256
  }
  delete persisted.requestedBy
  delete persisted.sealedArtifactId
  delete persisted.reason
  return dependencies.recordEvaluationRun(persisted)
}

interface RuntimeEvaluationServices {
  checkedInFixtures: Record<string, unknown>
  organisationScopeId: string
  deploymentBinding: {
    implementationGitSha: string
    artifactManifestDigest: string
    pagesBundleDigest: string
    workerBundleDigest: string
    bindingManifestDigest: string
    schemaVersion: string
    modelId: string
    tokenizerRevision: string
    documentBuilderRevision: string
    rankingRevision: string
    thresholdRevision: string
    providerContractDigest: string
    environment: 'test' | 'preview'
    loadProtocolDigest: string
    rateCardId: string
    previewPagesDeploymentId?: string | null
    previewWorkerDeploymentId?: string | null
  }
  executeGranularQueries(input: {
    request: Record<string, unknown>
    fixtures: Record<string, unknown>
    holdout: Record<string, unknown>
  }): Promise<unknown[]>
}

function resolveRuntimeServices(event: H3Event): RuntimeEvaluationServices {
  const services = (event.context as { crmSearchEvaluationServices?: unknown }).crmSearchEvaluationServices
  if (!services || typeof services !== 'object') throw new CrmSearchEvaluationRunnerError()
  const candidate = services as Partial<RuntimeEvaluationServices>
  if (!candidate.checkedInFixtures || typeof candidate.checkedInFixtures !== 'object'
    || typeof candidate.organisationScopeId !== 'string'
    || !candidate.deploymentBinding || typeof candidate.deploymentBinding !== 'object'
    || typeof candidate.executeGranularQueries !== 'function') throw new CrmSearchEvaluationRunnerError()
  return candidate as RuntimeEvaluationServices
}

export function resolveCrmSearchEvaluationOrganisationScopeId(event: H3Event): string {
  const organisationScopeId = resolveRuntimeServices(event).organisationScopeId
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
    .test(organisationScopeId)) throw new CrmSearchEvaluationRunnerError()
  return organisationScopeId
}

const operationalEvidenceKeys = [
  'queryKeyDigest', 'clientKeyDigest', 'entityType', 'strata',
  'crossClientLeakageCount', 'unauthorizedLeakageCount', 'deletedRecordLeakageCount',
  'semanticAddedLatencyMs', 'keywordLatencyMs', 'assistLatencyMs', 'fallback',
  'lateBilledCompletion', 'offResultDigest', 'shadowResultDigest', 'loadStratum',
  'observedP95Concurrency', 'loadConcurrency', 'staleRecordCount',
  'orphanedRecordCount', 'telemetryLeakageCount', 'telemetryInspectedAt',
  'reservedQueryUsdMicros', 'queryBudgetUsdMicros', 'reservedIndexingUsdMicros',
  'indexingBudgetUsdMicros', 'activeVectorCount', 'candidateVectorCount',
  'retiringVectorCount', 'sentinelVectorCount', 'deletionPendingVectorCount',
  'forecastVectorCount', 'vectorCapacity', 'activeNamespaceCount',
  'candidateNamespaceCount', 'retiringNamespaceCount', 'sentinelNamespaceCount',
  'deletionPendingNamespaceCount', 'forecastNamespaceCount', 'namespaceCapacity',
  'shadowEligible', 'shadowClientId', 'shadowObservedAt', 'shadowSamplingDigest',
  'shadowSampleBucket', 'shadowSampleThreshold'
] as const

function buildDatabaseQueryEvidence(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_granular_evidence_missing')
  }
  const source = value as Record<string, unknown>
  const projected: Record<string, unknown> = {}
  for (const key of operationalEvidenceKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_granular_evidence_missing')
    }
    projected[key] = source[key]
  }
  return Object.freeze({ ...projected, ...computeGranularQueryRankingMetrics(source) })
}

export async function startCrmSearchEvaluation(
  input: Record<string, unknown>,
  actorId: string,
  event: H3Event
): Promise<CrmSearchEvaluationRunRecord> {
  const services = resolveRuntimeServices(event)
  const sealedProvider = resolveCrmSearchSealedArtifactProvider(event)
  const fixtures = validateEvaluationFixtureBundle(services.checkedInFixtures)
  const exactDeploymentKeys = [
    'implementationGitSha', 'artifactManifestDigest', 'pagesBundleDigest',
    'workerBundleDigest', 'bindingManifestDigest', 'schemaVersion', 'modelId',
    'tokenizerRevision', 'documentBuilderRevision', 'rankingRevision', 'thresholdRevision'
  ] as const
  if (exactDeploymentKeys.some(key => input[key] !== services.deploymentBinding[key])
    || input.fixtureVersion !== fixtures.schemaVersion
    || input.datasetSha256 !== fixtures.corpus.sha256
    || input.preregistrationSha256 !== fixtures.preregistration.sha256
    || input.adjudicationSha256 !== fixtures.adjudicationManifest.sha256
    || input.sealedJudgementSha256 !== fixtures.holdoutManifest.sealedJudgementSha256) {
    throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_evidence_binding_mismatch')
  }
  return runCrmSearchEvaluation({
    ...input,
    ...services.deploymentBinding,
    organisationScopeId: services.organisationScopeId,
    requestedBy: actorId
  }, {
    loadCheckedInFixtures: async () => fixtures as unknown as Record<string, unknown>,
    freezePreregistration: async (fixtures) => {
      const preregistration = fixtures.preregistration
      if (!preregistration || typeof preregistration !== 'object') {
        throw new CrmSearchEvaluationRunnerError('crm_search_evaluation_preregistration_not_frozen')
      }
      return preregistration as Record<string, unknown>
    },
    unsealHoldout: request => unsealCrmSearchHoldout(request, sealedProvider),
    executeGranularQueries: services.executeGranularQueries,
    recordEvaluationRun: persisted => recordCrmSearchEvaluationRun({
      organisationScopeId: services.organisationScopeId,
      schemaVersion: services.deploymentBinding.schemaVersion,
      datasetVersion: fixtures.development.version,
      datasetSha256: fixtures.corpus.sha256,
      sealedJudgementSha256: String(persisted.sealedJudgementSha256),
      preregistrationSha256: fixtures.preregistration.sha256,
      adjudicationSha256: fixtures.adjudicationManifest.sha256,
      implementationGitSha: services.deploymentBinding.implementationGitSha,
      artifactManifestDigest: services.deploymentBinding.artifactManifestDigest,
      pagesBundleDigest: services.deploymentBinding.pagesBundleDigest,
      workerBundleDigest: services.deploymentBinding.workerBundleDigest,
      bindingManifestDigest: services.deploymentBinding.bindingManifestDigest,
      previewPagesDeploymentId: services.deploymentBinding.previewPagesDeploymentId ?? null,
      previewWorkerDeploymentId: services.deploymentBinding.previewWorkerDeploymentId ?? null,
      modelId: services.deploymentBinding.modelId,
      pooling: 'cls',
      tokenizerRevision: services.deploymentBinding.tokenizerRevision,
      documentBuilderRevision: services.deploymentBinding.documentBuilderRevision,
      rankingRevision: services.deploymentBinding.rankingRevision,
      thresholdRevision: services.deploymentBinding.thresholdRevision,
      providerContractDigest: services.deploymentBinding.providerContractDigest,
      environment: services.deploymentBinding.environment,
      loadProtocolDigest: services.deploymentBinding.loadProtocolDigest,
      rateCardId: services.deploymentBinding.rateCardId,
      implementationAuthorIds: fixtures.adjudicationManifest.implementationAuthorIds,
      fixtureAuthorIds: fixtures.adjudicationManifest.fixtureAuthorIds,
      judgementAuthorIds: fixtures.adjudicationManifest.judgementAuthorIds,
      domainReviewerIds: fixtures.adjudicationManifest.domainReviewerIds,
      adjudicatorIds: fixtures.adjudicationManifest.adjudicatorIds,
      runnerId: actorId,
      developmentQueryCount: fixtures.development.queries.length,
      queryEvidence: (persisted.queryEvidence as unknown[]).map(buildDatabaseQueryEvidence)
    } satisfies CrmSearchEvaluationRecordInput)
  })
}
