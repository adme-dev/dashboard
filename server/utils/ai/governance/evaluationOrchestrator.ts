import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { query, queryRows, transaction } from '~~/server/utils/db'
import {
  findEditableAssignmentFeature,
  resolveAiModelAssignment
} from '~~/server/utils/ai/modelAssignments'
import {
  getAiModelCatalogOption,
  type AiModelCatalogOption
} from '~~/server/utils/ai/modelRegistry'
import {
  EvaluationCaseResultSchema,
  EvaluationCaseSchema,
  EvaluationMaterialIdentitySchema,
  type EvaluationCase,
  type EvaluationCaseResult,
  type EvaluationMaterialIdentity
} from './contracts'
import {
  EvaluationRunnerBudgetSchema,
  runDeterministicEvaluation,
  type EvaluationModelExecutor,
  type EvaluationRunnerBudget,
  type EvaluationRunnerCase
} from './deterministicEvaluationRunner'
import {
  planEvaluationExecution,
  type EvaluationModelRateCard
} from './evaluationExecutionAdmission'
import {
  createPostgresEvaluationApprovalStore,
  createStoredEvaluationAdmissionDependencies,
  type EvaluationApprovalStore,
  type StoredEvaluationCostApproval
} from './evaluationApprovalStore'
import {
  finalizeEvaluationRun,
  claimEvaluationRun,
  createPostgresEvaluationRunTransaction,
  createQueuedEvaluationRun,
  postgresEvaluationRunRepository,
  type EvaluationRunRecord,
  type EvaluationRunRepository
} from './evaluationRunPersistence'
import {
  createEvaluationModelExecutor,
  type EvaluationModelExecutorOptions
} from './evaluationModelExecutor'

const UUID = z.uuid()
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/)
const PROVIDER = z.enum(['groq', 'anthropic', 'workers_ai'])
const SAFE_DB_INTEGER = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value, ctx) => {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Stored integer exceeds the safe range.' })
      return z.NEVER
    }
    return parsed
  })

const PreflightRequestSchema = z.strictObject({
  packVersionId: UUID,
  modelProvider: PROVIDER,
  modelId: z.string().trim().min(1).max(240),
  budget: EvaluationRunnerBudgetSchema
})

const ApproveRequestSchema = z.strictObject({
  evaluationRunId: UUID,
  planDigest: DIGEST,
  maxSpendUsdMicros: z.number().int().nonnegative().max(10_000_000_000),
  expiresAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(10).max(1_000)
})

const ExecuteRequestSchema = z.strictObject({
  evaluationRunId: UUID,
  planDigest: DIGEST,
  rateCardId: UUID,
  approvalId: UUID
})

export interface EvaluationPreflightRequest {
  packVersionId: string
  modelProvider: 'groq' | 'anthropic' | 'workers_ai'
  modelId: string
  budget: EvaluationRunnerBudget
}

export interface EvaluationPreflightResult {
  evaluationRunId: string
  departmentId: string
  planDigest: string
  rateCardId: string
  estimatedUpperBoundUsdMicros: number
  maxModelCalls: number
  decision: 'preflight_only' | 'requires_cost_approval'
}

export interface EvaluationMaterialSnapshot {
  departmentId: string
  packVersionId: string
  evaluationSuiteVersionId: string
  caseManifestDigest: string
  packMaterialDigest: string
  modelFeatureKey: string
  instructionsPreamble: string
  packBudget: {
    maxInputTokens: number
    maxOutputTokens: number
    maxCostUsdMicros: number
    maxLatencyMs: number
  }
  capabilityVersionIds: string[]
  availableTools: string[]
  cases: EvaluationRunnerCase[]
}

export interface EvaluationRunDetail {
  run: EvaluationRunRecord
  results: EvaluationCaseResult[]
}

export interface EvaluationPreflightArtifactTransaction {
  runRepository: EvaluationRunRepository
  approvalStore: EvaluationApprovalStore
}

export interface EvaluationPreflightArtifactRepository {
  transaction<T>(callback: (artifacts: EvaluationPreflightArtifactTransaction) => Promise<T>): Promise<T>
}

export interface EvaluationMaterialRepository {
  loadForPackVersion(packVersionId: string): Promise<EvaluationMaterialSnapshot | null>
  loadForEvaluationRun(evaluationRunId: string): Promise<{
    run: EvaluationRunRecord
    material: EvaluationMaterialSnapshot
  } | null>
  listEvaluationRuns(): Promise<EvaluationRunRecord[]>
  getEvaluationRun(evaluationRunId: string): Promise<EvaluationRunDetail | null>
}

export class EvaluationOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'EvaluationOrchestrationError'
  }
}

interface EvaluationOrchestratorDependencies {
  materialRepository: EvaluationMaterialRepository
  approvalStore: EvaluationApprovalStore
  runRepository: EvaluationRunRepository
  preflightRepository: EvaluationPreflightArtifactRepository
  resolveModelAssignment(featureKey: string): Promise<{ provider: string, modelId: string }>
  getModelCatalogOption(provider: string, modelId: string): AiModelCatalogOption | null
  createExecutor(options: EvaluationModelExecutorOptions): EvaluationModelExecutor
  now(): Date
  randomUUID(): string
  signal?: AbortSignal
  aiBinding?: unknown
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]))
  }
  return value
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function sortedCases(cases: EvaluationRunnerCase[]): EvaluationRunnerCase[] {
  return [...cases].sort((left, right) => left.id.localeCompare(right.id))
}

function validateMaterial(raw: EvaluationMaterialSnapshot): EvaluationMaterialSnapshot {
  UUID.parse(raw.departmentId)
  UUID.parse(raw.packVersionId)
  UUID.parse(raw.evaluationSuiteVersionId)
  DIGEST.parse(raw.caseManifestDigest)
  DIGEST.parse(raw.packMaterialDigest)
  const cases = sortedCases(raw.cases).map(item => ({
    id: UUID.parse(item.id),
    definition: EvaluationCaseSchema.parse(item.definition)
  }))
  if (cases.length < 1 || cases.length > 500) {
    throw new EvaluationOrchestrationError('evaluation_cases_invalid', 422, 'The evaluation suite has no executable cases')
  }
  const availableTools = [...new Set(raw.availableTools)].sort()
  if (availableTools.length !== raw.availableTools.length) {
    throw new EvaluationOrchestrationError('evaluation_tools_invalid', 422, 'The evaluation tool set is not unique')
  }
  const capabilityVersionIds = [...new Set(raw.capabilityVersionIds.map(id => UUID.parse(id)))].sort()
  if (capabilityVersionIds.length !== raw.capabilityVersionIds.length) {
    throw new EvaluationOrchestrationError('evaluation_capabilities_invalid', 422, 'The pack capability set is not unique')
  }
  return { ...raw, cases, availableTools, capabilityVersionIds }
}

function materialIdentity(
  material: EvaluationMaterialSnapshot,
  provider: string,
  modelId: string
): EvaluationMaterialIdentity {
  const promptVersionDigest = digest({
    schemaVersion: 1,
    packVersionId: material.packVersionId,
    packMaterialDigest: material.packMaterialDigest,
    evaluationSuiteVersionId: material.evaluationSuiteVersionId,
    caseManifestDigest: material.caseManifestDigest,
    instructionsPreamble: material.instructionsPreamble,
    cases: sortedCases(material.cases).map(item => ({ id: item.id, definition: item.definition }))
  })
  const toolsetVersionDigest = digest({
    schemaVersion: 1,
    packVersionId: material.packVersionId,
    packMaterialDigest: material.packMaterialDigest,
    capabilityVersionIds: [...material.capabilityVersionIds].sort(),
    availableTools: [...material.availableTools].sort()
  })
  return EvaluationMaterialIdentitySchema.parse({
    evaluationSuiteVersionId: material.evaluationSuiteVersionId,
    packVersionId: material.packVersionId,
    capabilityVersionId: null,
    modelProvider: provider,
    modelId,
    promptVersionDigest,
    toolsetVersionDigest
  })
}

function microsPerMillion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EvaluationOrchestrationError('model_pricing_invalid', 422, 'The selected model has invalid token pricing')
  }
  const micros = Math.round(value * 1_000_000)
  if (!Number.isSafeInteger(micros) || micros > 1_000_000_000_000) {
    throw new EvaluationOrchestrationError('model_pricing_invalid', 422, 'The selected model token pricing exceeds the supported range')
  }
  return micros
}

function buildRateCard(
  option: AiModelCatalogOption,
  validFrom: string,
  validUntil: string
): EvaluationModelRateCard {
  const inputUsd = option.pricing?.inputPricePerMillionUsd
  const outputUsd = option.pricing?.outputPricePerMillionUsd
  const inputMicros = microsPerMillion(inputUsd)
  const outputMicros = microsPerMillion(outputUsd)
  return {
    modelProvider: option.provider,
    modelId: option.modelId,
    inputUsdMicrosPerMillionTokens: inputMicros,
    outputUsdMicrosPerMillionTokens: outputMicros,
    sourceDigest: digest({
      schemaVersion: 1,
      provider: option.provider,
      modelId: option.modelId,
      pricingUsdPerMillion: { input: inputUsd, output: outputUsd },
      validFrom,
      validUntil
    }),
    validFrom,
    validUntil
  }
}

function assertBudgetWithinPack(material: EvaluationMaterialSnapshot, budget: EvaluationRunnerBudget): void {
  const expected = budgetForMaterial(material)
  if (JSON.stringify(budget) !== JSON.stringify(expected)) {
    throw new EvaluationOrchestrationError('evaluation_budget_invalid', 422, 'The evaluation budget is inconsistent with the frozen pack')
  }
}

function budgetForMaterial(material: EvaluationMaterialSnapshot): EvaluationRunnerBudget {
  return EvaluationRunnerBudgetSchema.parse({
    maxCases: material.cases.length,
    maxInputTokensPerCase: material.packBudget.maxInputTokens,
    maxOutputTokensPerCase: material.packBudget.maxOutputTokens,
    maxCostUsdMicrosPerCase: material.packBudget.maxCostUsdMicros,
    maxLatencyMsPerCase: material.packBudget.maxLatencyMs,
    maxTotalCostUsdMicros: Math.min(10_000_000_000, material.packBudget.maxCostUsdMicros * material.cases.length),
    maxWallTimeMs: Math.min(3_600_000, (material.packBudget.maxLatencyMs * material.cases.length) + 5_000)
  })
}

function admissionFailure(result: ReturnType<typeof planEvaluationExecution>): never {
  const issue = result.decision === 'rejected' ? result.issues[0] : null
  throw new EvaluationOrchestrationError(
    issue?.code ?? 'evaluation_not_admitted',
    409,
    'The evaluation execution was not admitted'
  )
}

async function defaultResolveModelAssignment(featureKey: string) {
  const known = findEditableAssignmentFeature(featureKey)
  const row = known.row
  if (!known.ok || !row || !PROVIDER.safeParse(row.provider).success) {
    throw new EvaluationOrchestrationError('model_assignment_unavailable', 409, 'The pack model assignment is unavailable')
  }
  const assignment = await resolveAiModelAssignment({
    featureKey,
    defaultProvider: PROVIDER.parse(row.provider),
    defaultModelId: row.modelId,
    defaultFallbackModelId: row.fallback,
    supportedProviders: ['groq', 'anthropic', 'workers_ai']
  })
  const catalogOption = getAiModelCatalogOption(assignment.provider, assignment.modelId)
  if (!catalogOption) {
    throw new EvaluationOrchestrationError('model_assignment_unavailable', 409, 'The pack model assignment is unavailable')
  }
  return { provider: assignment.provider, modelId: catalogOption.modelId }
}

const postgresApprovalStore = createPostgresEvaluationApprovalStore({
  async query(sql, params) {
    return { rows: await query(sql, params as any[]) }
  }
})

const postgresPreflightRepository: EvaluationPreflightArtifactRepository = {
  transaction(callback) {
    return transaction(async (db) => {
      const sqlClient = db as unknown as { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> }
      const runTx = createPostgresEvaluationRunTransaction(sqlClient)
      return callback({
        runRepository: { transaction: nested => nested(runTx) },
        approvalStore: createPostgresEvaluationApprovalStore(sqlClient)
      })
    })
  }
}

const defaultDependencies: EvaluationOrchestratorDependencies = {
  materialRepository: null as unknown as EvaluationMaterialRepository,
  approvalStore: postgresApprovalStore,
  runRepository: postgresEvaluationRunRepository,
  preflightRepository: postgresPreflightRepository,
  resolveModelAssignment: defaultResolveModelAssignment,
  getModelCatalogOption: getAiModelCatalogOption,
  createExecutor: createEvaluationModelExecutor,
  now: () => new Date(),
  randomUUID
}

export function createEvaluationOrchestrator(rawDependencies: Partial<EvaluationOrchestratorDependencies> = {}) {
  const dependencies = {
    ...defaultDependencies,
    materialRepository: rawDependencies.materialRepository ?? postgresEvaluationMaterialRepository,
    ...rawDependencies
  }

  return {
    async preflightEvaluation(raw: EvaluationPreflightRequest, rawActorId: string): Promise<EvaluationPreflightResult> {
      const input = PreflightRequestSchema.parse(raw)
      const actorId = UUID.parse(rawActorId)
      const loaded = await dependencies.materialRepository.loadForPackVersion(input.packVersionId)
      if (!loaded) throw new EvaluationOrchestrationError('evaluation_pack_not_found', 404, 'Evaluation pack version not found')
      const material = validateMaterial(loaded)
      assertBudgetWithinPack(material, input.budget)
      const assignment = await dependencies.resolveModelAssignment(material.modelFeatureKey)
      if (assignment.provider !== input.modelProvider || assignment.modelId !== input.modelId) {
        throw new EvaluationOrchestrationError('model_assignment_mismatch', 409, 'The selected model is not the pack current assignment')
      }
      const option = dependencies.getModelCatalogOption(input.modelProvider, input.modelId)
      if (!option || option.status === 'deprecated' || !option.pricing) {
        throw new EvaluationOrchestrationError('model_pricing_unavailable', 422, 'Trusted pricing is unavailable for the selected model')
      }
      const now = dependencies.now()
      if (!Number.isFinite(now.getTime())) {
        throw new EvaluationOrchestrationError('clock_invalid', 500, 'The trusted evaluation clock is invalid')
      }
      const validFrom = now.toISOString()
      const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()
      const rateCard = buildRateCard(option, validFrom, validUntil)
      const evaluationRunId = UUID.parse(dependencies.randomUUID())
      const rateCardId = UUID.parse(dependencies.randomUUID())
      const identity = materialIdentity(material, input.modelProvider, input.modelId)
      const admission = planEvaluationExecution({
        mode: 'model_simulation',
        evaluationRunId,
        materialIdentity: identity,
        caseCount: material.cases.length,
        availableTools: material.availableTools,
        budget: input.budget,
        rateCard
      }, {
        now: dependencies.now,
        isTrustedRateCard: candidate => JSON.stringify(candidate) === JSON.stringify(rateCard),
        isTrustedApproval: () => false
      })
      if (admission.decision === 'rejected') admissionFailure(admission)
      if (admission.decision !== 'requires_cost_approval') {
        throw new EvaluationOrchestrationError('evaluation_preflight_invalid', 500, 'Evaluation preflight produced an invalid decision')
      }
      await dependencies.preflightRepository.transaction(async artifacts => {
        await createQueuedEvaluationRun({
          runId: evaluationRunId,
          departmentId: material.departmentId,
          materialIdentity: identity,
          createdBy: actorId
        }, artifacts.runRepository)
        await artifacts.approvalStore.registerRateCard({
          id: rateCardId,
          ...rateCard,
          createdBy: actorId
        })
        await artifacts.approvalStore.persistPlan({
          evaluationRunId,
          departmentId: material.departmentId,
          planDigest: admission.planDigest,
          rateCardId,
          estimatedUpperBoundUsdMicros: admission.estimatedUpperBoundUsdMicros,
          maxModelCalls: material.cases.length,
          createdBy: actorId
        })
      })
      return {
        evaluationRunId,
        departmentId: material.departmentId,
        planDigest: admission.planDigest,
        rateCardId,
        estimatedUpperBoundUsdMicros: admission.estimatedUpperBoundUsdMicros,
        maxModelCalls: material.cases.length,
        decision: 'requires_cost_approval'
      }
    },

    async approveEvaluationCost(raw: {
      evaluationRunId: string
      planDigest: string
      maxSpendUsdMicros: number
      expiresAt: string
      reason: string
    }, rawActorId: string): Promise<StoredEvaluationCostApproval> {
      const input = ApproveRequestSchema.parse(raw)
      const actorId = UUID.parse(rawActorId)
      return dependencies.approvalStore.approvePlan({
        approvalId: UUID.parse(dependencies.randomUUID()),
        evaluationRunId: input.evaluationRunId,
        planDigest: input.planDigest,
        approvedBy: actorId,
        reason: input.reason,
        maxSpendUsdMicros: input.maxSpendUsdMicros,
        expiresAt: input.expiresAt
      })
    },

    async executeApprovedEvaluation(raw: {
      evaluationRunId: string
      planDigest: string
      rateCardId: string
      approvalId: string
    }, rawActorId: string): Promise<EvaluationRunRecord> {
      const input = ExecuteRequestSchema.parse(raw)
      UUID.parse(rawActorId)
      const loaded = await dependencies.materialRepository.loadForEvaluationRun(input.evaluationRunId)
      if (!loaded) throw new EvaluationOrchestrationError('evaluation_run_not_found', 404, 'Evaluation run not found')
      if (['completed', 'failed', 'cancelled'].includes(loaded.run.status)) {
        throw new EvaluationOrchestrationError('evaluation_run_already_terminal', 409, 'Evaluation run is already terminal')
      }
      const material = validateMaterial(loaded.material)
      const currentIdentity = materialIdentity(
        material,
        loaded.run.materialIdentity.modelProvider,
        loaded.run.materialIdentity.modelId
      )
      if (currentIdentity.promptVersionDigest !== loaded.run.materialIdentity.promptVersionDigest) {
        throw new EvaluationOrchestrationError('evaluation_prompt_digest_stale', 409, 'Evaluation prompt material changed after preflight')
      }
      if (currentIdentity.toolsetVersionDigest !== loaded.run.materialIdentity.toolsetVersionDigest) {
        throw new EvaluationOrchestrationError('evaluation_toolset_digest_stale', 409, 'Evaluation tool material changed after preflight')
      }
      if (
        currentIdentity.evaluationSuiteVersionId !== loaded.run.materialIdentity.evaluationSuiteVersionId
        || currentIdentity.packVersionId !== loaded.run.materialIdentity.packVersionId
      ) {
        throw new EvaluationOrchestrationError('evaluation_material_stale', 409, 'Evaluation material identity changed after preflight')
      }
      const assignment = await dependencies.resolveModelAssignment(material.modelFeatureKey)
      if (
        assignment.provider !== currentIdentity.modelProvider
        || assignment.modelId !== currentIdentity.modelId
      ) {
        throw new EvaluationOrchestrationError('model_assignment_mismatch', 409, 'The pack model assignment changed after preflight')
      }
      const artifacts = await dependencies.approvalStore.loadTrustedArtifacts(input)
      if (!artifacts) {
        throw new EvaluationOrchestrationError('evaluation_approval_unavailable', 409, 'Evaluation approval evidence is missing or revoked')
      }
      const option = dependencies.getModelCatalogOption(currentIdentity.modelProvider, currentIdentity.modelId)
      if (!option || !option.pricing) {
        throw new EvaluationOrchestrationError('model_pricing_unavailable', 409, 'Trusted pricing is unavailable at execution time')
      }
      const trustedRateCard = buildRateCard(option, artifacts.rateCard.validFrom, artifacts.rateCard.validUntil)
      if (JSON.stringify(trustedRateCard) !== JSON.stringify(artifacts.rateCard)) {
        throw new EvaluationOrchestrationError('rate_card_stale', 409, 'The trusted rate card changed after preflight')
      }
      const admission = planEvaluationExecution({
        mode: 'model_simulation',
        evaluationRunId: input.evaluationRunId,
        materialIdentity: currentIdentity,
        caseCount: material.cases.length,
        availableTools: material.availableTools,
        budget: budgetForMaterial(material),
        rateCard: artifacts.rateCard,
        approval: artifacts.approval
      }, createStoredEvaluationAdmissionDependencies(artifacts, dependencies.now))
      if (admission.decision !== 'approved') admissionFailure(admission)
      if (admission.planDigest !== input.planDigest) {
        throw new EvaluationOrchestrationError('evaluation_plan_digest_stale', 409, 'The evaluation plan changed after preflight')
      }
      const budget = admission.executionEnvelope.budget
      const executor = dependencies.createExecutor({
        modelProvider: currentIdentity.modelProvider as 'groq' | 'anthropic' | 'workers_ai',
        modelId: currentIdentity.modelId,
        rateCard: artifacts.rateCard,
        cases: material.cases.map(item => ({
          evaluationCaseId: item.id,
          instructionsPreamble: material.instructionsPreamble,
          allowedSourceIds: item.definition.requiredSources,
          declaredEffectSignals: item.definition.prohibitedEffects
        })),
        maxInputTokensPerCase: budget.maxInputTokensPerCase,
        maxOutputTokensPerCase: budget.maxOutputTokensPerCase,
        aiBinding: dependencies.aiBinding
      })
      try {
        await claimEvaluationRun({
          runId: input.evaluationRunId,
          planDigest: input.planDigest,
          rateCardId: input.rateCardId,
          approvalId: input.approvalId,
          claimedAt: dependencies.now().toISOString()
        }, dependencies.runRepository)
      } catch (error: any) {
        throw new EvaluationOrchestrationError(error?.code ?? 'evaluation_run_claim_conflict', error?.statusCode ?? 409, 'Evaluation run could not be claimed')
      }
      const result = await runDeterministicEvaluation({
        runId: input.evaluationRunId,
        materialIdentity: currentIdentity,
        cases: material.cases,
        availableTools: material.availableTools,
        budget,
        executionCostEnvelope: {
          maxCostUsdMicrosPerCase: admission.executionEnvelope.maxCostUsdMicrosPerCase,
          maxSpendUsdMicros: admission.executionEnvelope.maxSpendUsdMicros
        },
        signal: dependencies.signal
      }, executor)
      return finalizeEvaluationRun(input.evaluationRunId, result, dependencies.runRepository)
    },

    listEvaluations(): Promise<EvaluationRunRecord[]> {
      return dependencies.materialRepository.listEvaluationRuns()
    },

    getEvaluation(evaluationRunId: string): Promise<EvaluationRunDetail | null> {
      return dependencies.materialRepository.getEvaluationRun(UUID.parse(evaluationRunId))
    }
  }
}

type PackRow = {
  department_id: string
  pack_version_id: string
  evaluation_suite_version_id: string
  case_manifest_digest: string
  material_version_digest: string
  model_feature_key: string
  instructions_preamble: string
  max_input_tokens: number | string
  max_output_tokens: number | string
  max_cost_usd_micros: number | string
  max_latency_ms: number | string
}

type CaseRow = {
  id: string
  case_key: string
  case_version: number
  input: EvaluationCase['input']
  scope_fixture: EvaluationCase['scopeFixture']
  expected_tools: string[]
  expected_no_tool: boolean
  required_sources: string[]
  prohibited_effects: string[]
  zero_tolerance: EvaluationCase['zeroTolerance']
  scoring_rubric: EvaluationCase['scoringRubric']
}

const RUN_COLUMNS = `run.id, run.department_id, run.eval_suite_version_id, run.pack_version_id,
  run.capability_version_id, run.model_provider, run.model_id, run.prompt_version_digest,
  run.toolset_version_digest, run.status, run.gate_passed, run.case_count, run.passed_count,
  run.failed_count, run.human_review_count, run.total_input_tokens, run.total_output_tokens,
  run.total_cost_usd_micros, run.started_at, run.completed_at, run.created_by, run.created_at`

function mapRun(row: any): EvaluationRunRecord {
  return {
    id: UUID.parse(row.id),
    departmentId: UUID.parse(row.department_id),
    materialIdentity: EvaluationMaterialIdentitySchema.parse({
      evaluationSuiteVersionId: row.eval_suite_version_id,
      packVersionId: row.pack_version_id,
      capabilityVersionId: row.capability_version_id,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      promptVersionDigest: row.prompt_version_digest,
      toolsetVersionDigest: row.toolset_version_digest
    }),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).parse(row.status),
    gatePassed: z.boolean().nullable().parse(row.gate_passed),
    caseCount: SAFE_DB_INTEGER.parse(row.case_count),
    passedCount: SAFE_DB_INTEGER.parse(row.passed_count),
    failedCount: SAFE_DB_INTEGER.parse(row.failed_count),
    humanReviewCount: SAFE_DB_INTEGER.parse(row.human_review_count),
    totalInputTokens: SAFE_DB_INTEGER.parse(row.total_input_tokens),
    totalOutputTokens: SAFE_DB_INTEGER.parse(row.total_output_tokens),
    totalCostUsdMicros: SAFE_DB_INTEGER.parse(row.total_cost_usd_micros),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdBy: UUID.parse(row.created_by),
    createdAt: new Date(row.created_at).toISOString()
  }
}

function mapCase(row: CaseRow): EvaluationRunnerCase {
  return {
    id: UUID.parse(row.id),
    definition: EvaluationCaseSchema.parse({
      caseKey: row.case_key,
      caseVersion: row.case_version,
      input: row.input,
      scopeFixture: row.scope_fixture,
      expectedTools: row.expected_tools,
      expectedNoTool: row.expected_no_tool,
      requiredSources: row.required_sources,
      prohibitedEffects: row.prohibited_effects,
      zeroTolerance: row.zero_tolerance,
      scoringRubric: row.scoring_rubric
    })
  }
}

async function loadSnapshot(packVersionId: string, suiteVersionId?: string): Promise<EvaluationMaterialSnapshot | null> {
  const params = suiteVersionId ? [packVersionId, suiteVersionId] : [packVersionId]
  const suiteSelection = suiteVersionId
    ? 'suite_version.id = $2::uuid'
    : `suite_version.id = (
        SELECT latest.id FROM ai_eval_suite_versions latest
         WHERE latest.eval_suite_id = pack.evaluation_suite_id
           AND latest.department_id = pack.department_id
         ORDER BY latest.version DESC LIMIT 1
      )`
  const rows = await queryRows<PackRow>(
    `SELECT pack.department_id, pack.id AS pack_version_id,
            suite_version.id AS evaluation_suite_version_id,
            suite_version.case_manifest_digest, pack.material_version_digest,
            pack.model_feature_key, pack.instructions_preamble,
            pack.max_input_tokens, pack.max_output_tokens,
            pack.max_cost_usd_micros, pack.max_latency_ms
       FROM ai_capability_pack_versions pack
       JOIN ai_eval_suite_versions suite_version
         ON suite_version.eval_suite_id = pack.evaluation_suite_id
        AND suite_version.department_id = pack.department_id
        AND ${suiteSelection}
      WHERE pack.id = $1::uuid`,
    params
  )
  const row = rows[0]
  if (!row) return null
  const [caseRows, bindingRows] = await Promise.all([
    queryRows<CaseRow>(
      `SELECT id, case_key, case_version, input, scope_fixture, expected_tools,
              expected_no_tool, required_sources, prohibited_effects, zero_tolerance, scoring_rubric
         FROM ai_eval_cases
        WHERE eval_suite_version_id = $1::uuid AND department_id = $2::uuid
        ORDER BY case_key, case_version, id`,
      [row.evaluation_suite_version_id, row.department_id]
    ),
    queryRows<{ capability_version_id: string, tool_name: string | null }>(
      `SELECT link.capability_version_id, binding.tool_name
         FROM ai_pack_version_capabilities link
         LEFT JOIN ai_capability_tool_bindings binding
           ON binding.capability_version_id = link.capability_version_id
        WHERE link.pack_version_id = $1::uuid AND link.department_id = $2::uuid
        ORDER BY link.capability_version_id, binding.tool_name`,
      [row.pack_version_id, row.department_id]
    )
  ])
  return validateMaterial({
    departmentId: row.department_id,
    packVersionId: row.pack_version_id,
    evaluationSuiteVersionId: row.evaluation_suite_version_id,
    caseManifestDigest: row.case_manifest_digest,
    packMaterialDigest: row.material_version_digest,
    modelFeatureKey: row.model_feature_key,
    instructionsPreamble: row.instructions_preamble,
    packBudget: {
      maxInputTokens: SAFE_DB_INTEGER.parse(row.max_input_tokens),
      maxOutputTokens: SAFE_DB_INTEGER.parse(row.max_output_tokens),
      maxCostUsdMicros: SAFE_DB_INTEGER.parse(row.max_cost_usd_micros),
      maxLatencyMs: SAFE_DB_INTEGER.parse(row.max_latency_ms)
    },
    capabilityVersionIds: [...new Set(bindingRows.map(item => item.capability_version_id))],
    availableTools: [...new Set(bindingRows.flatMap(item => item.tool_name ? [item.tool_name] : []))],
    cases: caseRows.map(mapCase)
  })
}

export const postgresEvaluationMaterialRepository: EvaluationMaterialRepository = {
  loadForPackVersion(packVersionId) {
    return loadSnapshot(UUID.parse(packVersionId))
  },
  async loadForEvaluationRun(evaluationRunId) {
    const rows = await queryRows<any>(
      `SELECT ${RUN_COLUMNS} FROM ai_eval_runs run WHERE run.id = $1::uuid`,
      [UUID.parse(evaluationRunId)]
    )
    const row = rows[0]
    if (!row?.pack_version_id) return null
    const material = await loadSnapshot(row.pack_version_id, row.eval_suite_version_id)
    return material ? { run: mapRun(row), material } : null
  },
  async listEvaluationRuns() {
    const rows = await queryRows<any>(
      `SELECT ${RUN_COLUMNS} FROM ai_eval_runs run ORDER BY run.created_at DESC, run.id DESC LIMIT 200`
    )
    return rows.map(mapRun)
  },
  async getEvaluationRun(evaluationRunId) {
    const rows = await queryRows<any>(
      `SELECT ${RUN_COLUMNS} FROM ai_eval_runs run WHERE run.id = $1::uuid`,
      [UUID.parse(evaluationRunId)]
    )
    const row = rows[0]
    if (!row) return null
    const run = mapRun(row)
    const resultRows = await queryRows<any>(
      `SELECT eval_run_id, eval_case_id, outcome, score, deterministic_checks,
              observed_tools, source_refs, prohibited_effects_observed, trace_ref,
              input_tokens, output_tokens, cost_usd_micros, latency_ms
         FROM ai_eval_case_results WHERE eval_run_id = $1::uuid ORDER BY eval_case_id`,
      [run.id]
    )
    const results = resultRows.map(result => EvaluationCaseResultSchema.parse({
      evaluationRunId: result.eval_run_id,
      evaluationCaseId: result.eval_case_id,
      materialIdentity: run.materialIdentity,
      outcome: result.outcome,
      score: result.score === null ? null : Number(result.score),
      deterministicChecks: result.deterministic_checks,
      observedTools: result.observed_tools,
      sourceRefs: result.source_refs,
      prohibitedEffectsObserved: result.prohibited_effects_observed,
      traceRef: result.trace_ref,
      inputTokens: SAFE_DB_INTEGER.parse(result.input_tokens),
      outputTokens: SAFE_DB_INTEGER.parse(result.output_tokens),
      costUsdMicros: SAFE_DB_INTEGER.parse(result.cost_usd_micros),
      latencyMs: SAFE_DB_INTEGER.parse(result.latency_ms)
    }))
    return { run, results }
  }
}

export const evaluationOrchestrator = createEvaluationOrchestrator()
export const preflightEvaluation = evaluationOrchestrator.preflightEvaluation
export const approveEvaluationCost = evaluationOrchestrator.approveEvaluationCost
export const executeApprovedEvaluation = evaluationOrchestrator.executeApprovedEvaluation
export const listEvaluations = evaluationOrchestrator.listEvaluations
export const getEvaluation = evaluationOrchestrator.getEvaluation
