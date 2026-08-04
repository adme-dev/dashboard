import { z } from 'zod'
import { PERMISSION_GROUPS } from '~~/server/utils/permissions'

const UUID = z.string().uuid()
const VERSION_DIGEST = z.string().regex(/^[a-f0-9]{64}$/)
const MACHINE_KEY = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_:-]*$/)
const TOOL_NAME = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_]*$/)

export const AiReleaseStateSchema = z.enum(['draft', 'pilot', 'active', 'suspended', 'retired'])
export const AiCapabilityAccessModeSchema = z.enum(['read', 'draft', 'propose'])
export const AiRiskClassSchema = z.enum(['low', 'medium', 'high', 'critical'])
export const AiDataClassSchema = z.enum(['public', 'internal', 'confidential', 'restricted'])
export const AiApprovalModeSchema = z.enum(['none', 'confirm', 'rich_confirm', 'company_governed'])
export const AiCapabilityPermissionCeilingSchema = z.union([
  z.enum(PERMISSION_GROUPS),
  z.literal('AUTHENTICATED')
])

export const AiModelBudgetSchema = z.object({
  maxInputTokens: z.number().int().positive().max(1_000_000),
  maxOutputTokens: z.number().int().positive().max(1_000_000),
  maxCostUsdMicros: z.number().int().nonnegative().max(1_000_000_000),
  maxLatencyMs: z.number().int().positive().max(900_000)
}).strict()

export const CapabilityToolBindingSchema = z.object({
  toolName: TOOL_NAME,
  accessMode: AiCapabilityAccessModeSchema
}).strict()

/**
 * Immutable capability specification. Runtime composition must still intersect these bindings with
 * the existing RBAC-filtered registry; this contract can narrow authority but never grants it.
 */
export const CapabilityVersionSchema = z.object({
  capabilityId: UUID,
  departmentId: UUID,
  version: z.number().int().positive(),
  description: z.string().trim().min(1).max(4_000),
  requiredPermissionGroup: AiCapabilityPermissionCeilingSchema,
  riskClass: AiRiskClassSchema,
  dataClass: AiDataClassSchema,
  approvalMode: AiApprovalModeSchema,
  modelFeatureKey: MACHINE_KEY,
  evaluationSuiteId: UUID,
  budget: AiModelBudgetSchema,
  toolBindings: z.array(CapabilityToolBindingSchema).min(1).max(64)
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>()
  for (const [index, binding] of value.toolBindings.entries()) {
    if (seen.has(binding.toolName)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Tool bindings must be unique within a capability version.',
        path: ['toolBindings', index, 'toolName']
      })
    }
    seen.add(binding.toolName)
  }

  if (value.toolBindings.some(binding => binding.accessMode === 'propose') && value.approvalMode === 'none') {
    ctx.addIssue({
      code: 'custom',
      message: 'Proposal capabilities require an approval mode.',
      path: ['approvalMode']
    })
  }
})

const FORBIDDEN_FIXTURE_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'apikey',
  'secret',
  'password',
  'email',
  'phone',
  'fullname',
  'firstname',
  'lastname',
  'prototype',
  'constructor',
  'proto'
])

/**
 * Evaluation fixtures are model-visible data. Grading and answer fields belong only to the
 * surrounding case definition, never in `input.context` or `scopeFixture`, where they could
 * steer the model or disclose the deterministic scorer's expectation.
 */
const FORBIDDEN_GRADING_FIXTURE_KEYS = new Set([
  'expectedanswer',
  'expectedresult',
  'expectedoutcome',
  'expectedtools',
  'expectednotool',
  'scoringrubric',
  'score',
  'outcome',
  'result'
])

function normalizedFixtureKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function forbiddenFixtureKeyMessage(key: string): string | null {
  const normalized = normalizedFixtureKey(key)
  if (FORBIDDEN_FIXTURE_KEYS.has(normalized)) {
    return 'Evaluation fixtures must use opaque references and cannot store secrets or direct PII.'
  }
  if (FORBIDDEN_GRADING_FIXTURE_KEYS.has(normalized)) {
    return 'Evaluation fixtures cannot contain grading or answer metadata.'
  }
  return null
}

interface FixtureViolation {
  message: string
  path: Array<string | number>
}

function validateSafeFixture(value: unknown): FixtureViolation | null {
  const stack: Array<{ value: unknown, path: Array<string | number>, depth: number }> = [
    { value, path: [], depth: 0 }
  ]
  let visitedNodes = 0

  while (stack.length > 0) {
    const current = stack.pop()!
    visitedNodes += 1
    if (visitedNodes > 5_000) {
      return { message: 'Evaluation fixtures cannot exceed 5,000 values.', path: current.path }
    }
    if (current.depth > 12) {
      return { message: 'Evaluation fixtures cannot exceed 12 levels.', path: current.path }
    }

    if (Array.isArray(current.value)) {
      if (current.value.length > 500) {
        return { message: 'Evaluation fixture arrays cannot exceed 500 items.', path: current.path }
      }
      for (const [index, item] of current.value.entries()) {
        stack.push({ value: item, path: [...current.path, index], depth: current.depth + 1 })
      }
      continue
    }

    if (current.value && typeof current.value === 'object') {
      const prototype = Object.getPrototypeOf(current.value)
      if (prototype !== Object.prototype && prototype !== null) {
        return { message: 'Evaluation fixtures must contain JSON objects only.', path: current.path }
      }
      const entries = Object.entries(current.value)
      if (entries.length > 500) {
        return { message: 'Evaluation fixture objects cannot exceed 500 fields.', path: current.path }
      }
      for (const [key, item] of entries) {
        const nextPath = [...current.path, key]
        const forbiddenMessage = forbiddenFixtureKeyMessage(key)
        if (forbiddenMessage) {
          return {
            message: forbiddenMessage,
            path: nextPath
          }
        }
        stack.push({ value: item, path: nextPath, depth: current.depth + 1 })
      }
      continue
    }

    if (typeof current.value === 'string' && current.value.length > 20_000) {
      return { message: 'Evaluation fixture strings cannot exceed 20,000 characters.', path: current.path }
    }
    if (typeof current.value === 'number' && !Number.isFinite(current.value)) {
      return { message: 'Evaluation fixtures require finite JSON numbers.', path: current.path }
    }
    if (!['string', 'number', 'boolean'].includes(typeof current.value) && current.value !== null) {
      return { message: 'Evaluation fixtures must contain JSON values only.', path: current.path }
    }
  }

  return null
}

const SafeScopeFixtureSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  const violation = validateSafeFixture(value)
  if (violation) {
    ctx.addIssue({
      code: 'custom',
      message: violation.message,
      path: violation.path
    })
  }
})

const EvaluationInputSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  context: SafeScopeFixtureSchema.optional()
}).strict()

const EvaluationRubricDimensionSchema = z.object({
  key: MACHINE_KEY,
  weight: z.number().positive().max(1_000),
  minimumScore: z.number().min(0).max(1)
}).strict()

export const EvaluationCaseSchema = z.object({
  caseKey: MACHINE_KEY,
  caseVersion: z.number().int().positive(),
  input: EvaluationInputSchema,
  scopeFixture: SafeScopeFixtureSchema,
  expectedTools: z.array(TOOL_NAME).max(64),
  expectedNoTool: z.boolean(),
  requiredSources: z.array(MACHINE_KEY).max(64),
  prohibitedEffects: z.array(MACHINE_KEY).max(64),
  zeroTolerance: z.array(z.enum(['scope', 'prohibited_effect', 'approval_bypass'])).min(1),
  scoringRubric: z.array(EvaluationRubricDimensionSchema).min(1).max(32)
}).strict().superRefine((value, ctx) => {
  if (value.expectedNoTool && value.expectedTools.length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'A no-tool case cannot also expect tool calls.',
      path: ['expectedTools']
    })
  }

  for (const [field, values] of [
    ['expectedTools', value.expectedTools],
    ['requiredSources', value.requiredSources],
    ['prohibitedEffects', value.prohibitedEffects],
    ['zeroTolerance', value.zeroTolerance]
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', message: `${field} values must be unique.`, path: [field] })
    }
  }
})

/** Exact material identity required before evaluation evidence can gate a release. */
export const EvaluationMaterialIdentitySchema = z.object({
  evaluationSuiteVersionId: UUID,
  packVersionId: UUID.nullable(),
  capabilityVersionId: UUID.nullable(),
  modelProvider: MACHINE_KEY,
  modelId: z.string().trim().min(1).max(240),
  promptVersionDigest: VERSION_DIGEST,
  toolsetVersionDigest: VERSION_DIGEST
}).strict().refine(
  value => value.packVersionId !== null || value.capabilityVersionId !== null,
  { message: 'Evaluation evidence must bind a pack version or capability version.' }
)

export const EvaluationCaseResultSchema = z.object({
  evaluationRunId: UUID,
  evaluationCaseId: UUID,
  materialIdentity: EvaluationMaterialIdentitySchema,
  outcome: z.enum(['pass', 'fail', 'error', 'human_review']),
  score: z.number().min(0).max(1).nullable(),
  deterministicChecks: SafeScopeFixtureSchema,
  observedTools: z.array(TOOL_NAME).max(64),
  sourceRefs: z.array(MACHINE_KEY).max(128),
  prohibitedEffectsObserved: z.array(MACHINE_KEY).max(64),
  traceRef: z.string().trim().min(1).max(500).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsdMicros: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative().max(900_000)
}).strict().superRefine((value, ctx) => {
  if (value.outcome === 'pass' && value.score === null) {
    ctx.addIssue({ code: 'custom', message: 'Passing results require a score.', path: ['score'] })
  }
  if (value.outcome === 'pass' && value.prohibitedEffectsObserved.length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'A result with observed prohibited effects cannot pass.',
      path: ['prohibitedEffectsObserved']
    })
  }
  for (const [field, values] of [
    ['observedTools', value.observedTools],
    ['sourceRefs', value.sourceRefs],
    ['prohibitedEffectsObserved', value.prohibitedEffectsObserved]
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', message: `${field} values must be unique.`, path: [field] })
    }
  }
})

export type EvaluationMaterialIdentity = z.infer<typeof EvaluationMaterialIdentitySchema>

export function isEvaluationEvidenceReusable(
  evidence: EvaluationMaterialIdentity,
  current: EvaluationMaterialIdentity
): boolean {
  return evidence.evaluationSuiteVersionId === current.evaluationSuiteVersionId
    && evidence.packVersionId === current.packVersionId
    && evidence.capabilityVersionId === current.capabilityVersionId
    && evidence.modelProvider === current.modelProvider
    && evidence.modelId === current.modelId
    && evidence.promptVersionDigest === current.promptVersionDigest
    && evidence.toolsetVersionDigest === current.toolsetVersionDigest
}

export type CapabilityVersion = z.infer<typeof CapabilityVersionSchema>
export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>
export type EvaluationCaseResult = z.infer<typeof EvaluationCaseResultSchema>
