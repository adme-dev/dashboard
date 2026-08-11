import { queryOne } from '~~/server/utils/db'

export interface CrmSearchEvaluationRecordInput {
  organisationScopeId: string
  schemaVersion: string
  datasetVersion: string
  datasetSha256: string
  sealedJudgementSha256: string
  preregistrationSha256: string
  adjudicationSha256: string
  implementationGitSha: string
  artifactManifestDigest: string
  pagesBundleDigest: string
  workerBundleDigest: string
  bindingManifestDigest: string
  previewPagesDeploymentId?: string | null
  previewWorkerDeploymentId?: string | null
  modelId: string
  pooling: 'cls'
  tokenizerRevision: string
  documentBuilderRevision: string
  rankingRevision: string
  thresholdRevision: string
  providerContractDigest: string
  environment: 'test' | 'preview'
  loadProtocolDigest: string
  rateCardId: string
  implementationAuthorIds: string[]
  fixtureAuthorIds: string[]
  judgementAuthorIds: string[]
  domainReviewerIds: string[]
  adjudicatorIds: string[]
  runnerId: string
  developmentQueryCount: number
  reason: string
  queryEvidence: unknown[]
}

export interface CrmSearchEvaluationRunRecord {
  id: string
  gatePassed: boolean
  createdAt?: string
  expiresAt?: string
  metricBundle?: Record<string, unknown>
}

export interface CrmSearchEvaluationRepositoryDependencies {
  queryOne?: typeof queryOne
}

function requireRunId(row: unknown): string {
  const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : null
  if (typeof id !== 'string') throw new Error('CRM search evaluation recorder returned no run ID')
  return id
}

/**
 * The database function accepts granular query evidence and owns all metric and
 * gate recomputation. There is intentionally no metric bundle or pass flag in
 * this adapter input.
 */
export async function recordCrmSearchEvaluationRun(
  input: CrmSearchEvaluationRecordInput,
  dependencies: CrmSearchEvaluationRepositoryDependencies = {}
): Promise<CrmSearchEvaluationRunRecord> {
  const runQuery = dependencies.queryOne ?? queryOne
  const row = await runQuery<{ id: string }>(`
    SELECT crm_search_record_evaluation_run(
      $1::UUID, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
      $24::UUID, $25::UUID[], $26::UUID[], $27::UUID[], $28::UUID[],
      $29::UUID[], $30::UUID, $31, $32, $33::JSONB
    ) AS id
  `, [
    input.organisationScopeId,
    input.schemaVersion,
    input.datasetVersion,
    input.datasetSha256,
    input.sealedJudgementSha256,
    input.preregistrationSha256,
    input.adjudicationSha256,
    input.implementationGitSha,
    input.artifactManifestDigest,
    input.pagesBundleDigest,
    input.workerBundleDigest,
    input.bindingManifestDigest,
    input.previewPagesDeploymentId ?? null,
    input.previewWorkerDeploymentId ?? null,
    input.modelId,
    input.pooling,
    input.tokenizerRevision,
    input.documentBuilderRevision,
    input.rankingRevision,
    input.thresholdRevision,
    input.providerContractDigest,
    input.environment,
    input.loadProtocolDigest,
    input.rateCardId,
    input.implementationAuthorIds,
    input.fixtureAuthorIds,
    input.judgementAuthorIds,
    input.domainReviewerIds,
    input.adjudicatorIds,
    input.runnerId,
    input.developmentQueryCount,
    input.reason,
    JSON.stringify(input.queryEvidence)
  ])
  const id = requireRunId(row)
  return getCrmSearchEvaluationRun(id, input.organisationScopeId, dependencies)
}

export async function getCrmSearchEvaluationRun(
  id: string,
  organisationScopeId: string,
  dependencies: CrmSearchEvaluationRepositoryDependencies = {}
): Promise<CrmSearchEvaluationRunRecord> {
  const runQuery = dependencies.queryOne ?? queryOne
  const row = await runQuery<Record<string, unknown>>(`
    SELECT id, gate_passed, metric_bundle, created_at, expires_at
    FROM crm_search_evaluation_runs
    WHERE id = $1::UUID
      AND organisation_scope_id = $2::UUID
  `, [id, organisationScopeId])
  if (!row || typeof row.id !== 'string' || typeof row.gate_passed !== 'boolean') {
    throw Object.assign(new Error('CRM search evaluation run not found'), { code: 'crm_search_evaluation_not_found' })
  }
  return Object.freeze({
    id: row.id,
    gatePassed: row.gate_passed,
    metricBundle: row.metric_bundle && typeof row.metric_bundle === 'object'
      ? row.metric_bundle as Record<string, unknown>
      : {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at)
  })
}
