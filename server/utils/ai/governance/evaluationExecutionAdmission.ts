import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  EvaluationMaterialIdentitySchema,
  type EvaluationMaterialIdentity
} from './contracts'
import {
  EvaluationRunnerBudgetSchema,
  type EvaluationRunnerBudget
} from './deterministicEvaluationRunner'

const UUID = z.uuid()
const VERSION_DIGEST = z.string().regex(/^[a-f0-9]{64}$/)
const MACHINE_KEY = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_:-]*$/)
const TOOL_NAME = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_]*$/)
const UTC_TIMESTAMP = z.string().datetime({ offset: true })

export const EvaluationModelRateCardSchema = z.strictObject({
  modelProvider: MACHINE_KEY,
  modelId: z.string().trim().min(1).max(240),
  inputUsdMicrosPerMillionTokens: z.number().int().nonnegative().max(1_000_000_000_000),
  outputUsdMicrosPerMillionTokens: z.number().int().nonnegative().max(1_000_000_000_000),
  sourceDigest: VERSION_DIGEST,
  validFrom: UTC_TIMESTAMP,
  validUntil: UTC_TIMESTAMP
}).refine(value => Date.parse(value.validUntil) > Date.parse(value.validFrom), {
  message: 'The rate card expiry must be after its effective time.',
  path: ['validUntil']
})

export const EvaluationCostApprovalSchema = z.strictObject({
  approvalId: UUID,
  planDigest: VERSION_DIGEST,
  approvedBy: UUID,
  reason: z.string().trim().min(10).max(1_000),
  maxSpendUsdMicros: z.number().int().nonnegative().max(10_000_000_000),
  approvedAt: UTC_TIMESTAMP,
  expiresAt: UTC_TIMESTAMP
}).refine(value => Date.parse(value.expiresAt) > Date.parse(value.approvedAt), {
  message: 'The approval expiry must be after its approval time.',
  path: ['expiresAt']
})

const PlanningBaseSchema = z.strictObject({
  evaluationRunId: UUID,
  materialIdentity: EvaluationMaterialIdentitySchema,
  caseCount: z.number().int().min(1).max(500),
  availableTools: z.array(TOOL_NAME).max(64).superRefine((tools, ctx) => {
    if (new Set(tools).size !== tools.length) {
      ctx.addIssue({ code: 'custom', message: 'Available tools must be unique.' })
    }
  }),
  budget: EvaluationRunnerBudgetSchema
})

const ManifestPlanningRequestSchema = PlanningBaseSchema.extend({
  mode: z.literal('manifest_only')
})

const ModelPlanningRequestSchema = PlanningBaseSchema.extend({
  mode: z.literal('model_simulation'),
  rateCard: EvaluationModelRateCardSchema.optional(),
  approval: EvaluationCostApprovalSchema.optional()
})

export const EvaluationExecutionPlanningRequestSchema = z.discriminatedUnion('mode', [
  ManifestPlanningRequestSchema,
  ModelPlanningRequestSchema
])

export type EvaluationModelRateCard = z.infer<typeof EvaluationModelRateCardSchema>
export type EvaluationCostApproval = z.infer<typeof EvaluationCostApprovalSchema>
export type EvaluationExecutionPlanningRequest = z.infer<typeof EvaluationExecutionPlanningRequestSchema>

export interface EvaluationAdmissionIssue {
  code: string
  message: string
}

interface EvaluationAdmissionBase {
  planDigest: string
  estimatedUpperBoundUsdMicros: number
  sideEffectsAllowed: false
  modelCallsAllowed: boolean
}

export type EvaluationExecutionAdmissionResult = EvaluationAdmissionBase & {
  decision: 'preflight_only'
  modelCallsAllowed: false
}
| EvaluationAdmissionBase & {
  decision: 'requires_cost_approval'
  modelCallsAllowed: false
  reason: 'cost_approval_required'
}
| EvaluationAdmissionBase & {
  decision: 'rejected'
  modelCallsAllowed: false
  issues: EvaluationAdmissionIssue[]
}
| EvaluationAdmissionBase & {
  decision: 'approved'
  modelCallsAllowed: true
  executionEnvelope: EvaluationExecutionEnvelope
}

export interface EvaluationExecutionEnvelope {
  executionMode: 'simulation'
  sideEffectsAllowed: false
  evaluationRunId: string
  approvalId: string
  planDigest: string
  approvedBy: string
  notAfter: string
  maxSpendUsdMicros: number
  maxCostUsdMicrosPerCase: number
  maxModelCalls: number
  rateCard: Readonly<EvaluationModelRateCard>
  materialIdentity: EvaluationMaterialIdentity
  caseCount: number
  availableTools: readonly string[]
  budget: Readonly<EvaluationRunnerBudget>
}

export interface EvaluationAdmissionDependencies {
  now(): Date
  isTrustedApproval(approval: EvaluationCostApproval): boolean
  isTrustedRateCard(rateCard: EvaluationModelRateCard): boolean
}

const defaultDependencies: EvaluationAdmissionDependencies = {
  now: () => new Date(),
  isTrustedApproval: () => false,
  isTrustedRateCard: () => false
}
const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const TOKENS_PER_MILLION = BigInt(1_000_000)

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

function ceilDivide(value: bigint, divisor: bigint): bigint {
  return value === BIGINT_ZERO
    ? BIGINT_ZERO
    : ((value - BIGINT_ONE) / divisor) + BIGINT_ONE
}

function estimatedCostMicros(
  caseCount: number,
  budget: EvaluationRunnerBudget,
  rateCard: EvaluationModelRateCard
): { perCase: bigint, total: bigint } {
  const perCase = ceilDivide(
    (BigInt(budget.maxInputTokensPerCase) * BigInt(rateCard.inputUsdMicrosPerMillionTokens))
    + (BigInt(budget.maxOutputTokensPerCase) * BigInt(rateCard.outputUsdMicrosPerMillionTokens)),
    TOKENS_PER_MILLION
  )
  return { perCase, total: perCase * BigInt(caseCount) }
}

function normalizedPlan(input: EvaluationExecutionPlanningRequest) {
  return {
    version: 1,
    mode: input.mode,
    evaluationRunId: input.evaluationRunId,
    materialIdentity: input.materialIdentity,
    caseCount: input.caseCount,
    availableTools: [...input.availableTools].sort(),
    budget: input.budget,
    rateCard: input.mode === 'model_simulation' && input.rateCard
      ? {
          ...input.rateCard,
          validFrom: new Date(input.rateCard.validFrom).toISOString(),
          validUntil: new Date(input.rateCard.validUntil).toISOString()
        }
      : null,
    executionControls: {
      executionMode: input.mode === 'model_simulation' ? 'simulation' : 'manifest_only',
      sideEffectsAllowed: false,
      toolImplementation: 'fixture_only',
      maxModelCalls: input.mode === 'model_simulation' ? input.caseCount : 0
    }
  }
}

function rejected(
  planDigest: string,
  estimatedUpperBoundUsdMicros: number,
  issues: EvaluationAdmissionIssue[]
): EvaluationExecutionAdmissionResult {
  return {
    decision: 'rejected',
    planDigest,
    estimatedUpperBoundUsdMicros,
    modelCallsAllowed: false,
    sideEffectsAllowed: false,
    issues
  }
}

/**
 * Pure admission planning. It cannot call a model, execute a tool, persist a run, or notify a user.
 * The approved envelope is the only result that can be handed to a future model executor.
 */
export function planEvaluationExecution(
  raw: EvaluationExecutionPlanningRequest,
  dependencies: Partial<EvaluationAdmissionDependencies> = defaultDependencies
): EvaluationExecutionAdmissionResult {
  const resolvedDependencies = { ...defaultDependencies, ...dependencies }
  const input = EvaluationExecutionPlanningRequestSchema.parse(raw)
  const plan = normalizedPlan(input)
  const planDigest = digest(plan)
  const now = resolvedDependencies.now().getTime()
  const planIssues: EvaluationAdmissionIssue[] = []
  if (!Number.isFinite(now)) {
    planIssues.push({ code: 'clock_invalid', message: 'A valid trusted clock is required for evaluation admission.' })
  }
  if (input.caseCount > input.budget.maxCases) {
    planIssues.push({ code: 'case_count_exceeds_budget', message: 'The evaluation case count exceeds the runner budget.' })
  }
  if (planIssues.length > 0) return rejected(planDigest, 0, planIssues)

  if (input.mode === 'manifest_only') {
    return {
      decision: 'preflight_only',
      planDigest,
      estimatedUpperBoundUsdMicros: 0,
      modelCallsAllowed: false,
      sideEffectsAllowed: false
    }
  }

  const issues: EvaluationAdmissionIssue[] = []
  if (!input.rateCard) {
    issues.push({ code: 'rate_card_required', message: 'A current, model-specific rate card is required.' })
    return rejected(planDigest, 0, issues)
  }

  const rateValidFrom = Date.parse(input.rateCard.validFrom)
  const rateValidUntil = Date.parse(input.rateCard.validUntil)
  if (!resolvedDependencies.isTrustedRateCard(input.rateCard)) {
    issues.push({
      code: 'rate_card_untrusted',
      message: 'The rate card was not authenticated by the pricing source.'
    })
  }
  if (
    input.rateCard.modelProvider !== input.materialIdentity.modelProvider
    || input.rateCard.modelId !== input.materialIdentity.modelId
  ) {
    issues.push({ code: 'rate_card_model_mismatch', message: 'The rate card does not match the evaluated model identity.' })
  }
  if (now < rateValidFrom) {
    issues.push({ code: 'rate_card_not_yet_valid', message: 'The rate card is not yet valid.' })
  }
  if (now >= rateValidUntil) {
    issues.push({ code: 'rate_card_expired', message: 'The rate card has expired.' })
  }

  const estimate = estimatedCostMicros(input.caseCount, input.budget, input.rateCard)
  if (estimate.perCase > BigInt(input.budget.maxCostUsdMicrosPerCase)) {
    issues.push({
      code: 'per_case_cost_budget_inconsistent',
      message: 'The token ceiling can cost more than the permitted per-case cost ceiling.'
    })
  }
  if (estimate.total > BigInt(input.budget.maxTotalCostUsdMicros)) {
    issues.push({
      code: 'total_cost_budget_inconsistent',
      message: 'The evaluation upper-bound cost exceeds the permitted total cost ceiling.'
    })
  }

  const boundedEstimate = estimate.total <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(estimate.total)
    : Number.MAX_SAFE_INTEGER
  if (issues.length > 0) return rejected(planDigest, boundedEstimate, issues)

  if (!input.approval) {
    return {
      decision: 'requires_cost_approval',
      planDigest,
      estimatedUpperBoundUsdMicros: boundedEstimate,
      modelCallsAllowed: false,
      sideEffectsAllowed: false,
      reason: 'cost_approval_required'
    }
  }

  const approvalIssues: EvaluationAdmissionIssue[] = []
  if (!resolvedDependencies.isTrustedApproval(input.approval)) {
    approvalIssues.push({
      code: 'approval_untrusted',
      message: 'The cost approval was not authenticated by the governance store.'
    })
  }
  if (input.approval.planDigest !== planDigest) {
    approvalIssues.push({ code: 'approval_plan_mismatch', message: 'The approval does not match this exact evaluation plan.' })
  }
  const approvedAt = Date.parse(input.approval.approvedAt)
  const approvalExpiresAt = Date.parse(input.approval.expiresAt)
  if (now < approvedAt) {
    approvalIssues.push({ code: 'approval_not_yet_valid', message: 'The cost approval is not yet valid.' })
  }
  if (now >= approvalExpiresAt) {
    approvalIssues.push({ code: 'approval_expired', message: 'The cost approval has expired.' })
  }
  if (approvalExpiresAt > rateValidUntil) {
    approvalIssues.push({
      code: 'approval_outlives_rate_card',
      message: 'The cost approval cannot remain valid after its rate card expires.'
    })
  }
  if (BigInt(input.approval.maxSpendUsdMicros) < estimate.total) {
    approvalIssues.push({
      code: 'approval_spend_insufficient',
      message: 'The approved spend is below the evaluation upper-bound cost.'
    })
  }
  if (approvalIssues.length > 0) return rejected(planDigest, boundedEstimate, approvalIssues)

  return {
    decision: 'approved',
    planDigest,
    estimatedUpperBoundUsdMicros: boundedEstimate,
    modelCallsAllowed: true,
    sideEffectsAllowed: false,
    executionEnvelope: Object.freeze({
      executionMode: 'simulation',
      sideEffectsAllowed: false,
      evaluationRunId: input.evaluationRunId,
      approvalId: input.approval.approvalId,
      planDigest,
      approvedBy: input.approval.approvedBy,
      notAfter: new Date(Math.min(approvalExpiresAt, rateValidUntil)).toISOString(),
      maxSpendUsdMicros: boundedEstimate,
      maxCostUsdMicrosPerCase: Number(estimate.perCase),
      maxModelCalls: input.caseCount,
      rateCard: Object.freeze(structuredClone(input.rateCard)),
      materialIdentity: Object.freeze(structuredClone(input.materialIdentity)),
      caseCount: input.caseCount,
      availableTools: Object.freeze([...input.availableTools].sort()),
      budget: Object.freeze(structuredClone(input.budget))
    })
  }
}
