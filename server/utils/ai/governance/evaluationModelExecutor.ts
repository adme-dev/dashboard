import { generateText } from 'ai'
import { z } from 'zod'
import { resolveModel } from '~~/server/utils/claudeClient'
import type {
  EvaluationExecutorObservation,
  EvaluationExecutorRequest,
  EvaluationModelExecutor
} from './deterministicEvaluationRunner'
import {
  EvaluationModelRateCardSchema,
  type EvaluationModelRateCard
} from './evaluationExecutionAdmission'

const UUID = z.uuid()
const MACHINE_KEY = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_:-]*$/)
const TOOL_NAME = z.string().min(2).max(120).regex(/^[a-z][a-z0-9_]*$/)

const InvocationResultSchema = z.strictObject({
  observedTools: z.array(TOOL_NAME).max(64),
  sourceRefs: z.array(MACHINE_KEY).max(128),
  effectSignals: z.array(MACHINE_KEY).max(64),
  scopeViolationObserved: z.boolean(),
  approvalBypassObserved: z.boolean(),
  traceRef: MACHINE_KEY.nullable(),
  inputTokens: z.number().int().nonnegative().max(1_000_000),
  outputTokens: z.number().int().nonnegative().max(1_000_000)
})

const ModelSignalsSchema = InvocationResultSchema.omit({ inputTokens: true, outputTokens: true })

const CasePolicySchema = z.strictObject({
  evaluationCaseId: UUID,
  instructionsPreamble: z.string().max(20_000),
  allowedSourceIds: z.array(MACHINE_KEY).max(128),
  declaredEffectSignals: z.array(MACHINE_KEY).max(64)
})

export interface EvaluationSimulationToolDescriptor {
  readonly name: string
  readonly description: string
  record(args: unknown): Promise<{ recorded: true }>
}

export interface EvaluationModelInvocationRequest {
  readonly modelProvider: 'groq' | 'anthropic' | 'workers_ai'
  readonly modelId: string
  readonly system: string
  readonly prompt: string
  readonly context: Readonly<Record<string, unknown>> | null
  readonly scopeFixture: Readonly<Record<string, unknown>>
  readonly tools: readonly EvaluationSimulationToolDescriptor[]
  readonly allowedSourceIds: readonly string[]
  readonly declaredEffectSignals: readonly string[]
  readonly serializedInput: string
  readonly maxOutputTokens: number
  readonly executionMode: 'simulation'
  readonly sideEffectsAllowed: false
  readonly signal?: AbortSignal
}

export type EvaluationModelInvocationResult = z.infer<typeof InvocationResultSchema>

export interface EvaluationSimulationCasePolicy {
  evaluationCaseId: string
  instructionsPreamble: string
  allowedSourceIds: string[]
  declaredEffectSignals: string[]
}

export interface EvaluationModelExecutorOptions {
  modelProvider: 'groq' | 'anthropic' | 'workers_ai'
  modelId: string
  rateCard: EvaluationModelRateCard
  cases: EvaluationSimulationCasePolicy[]
  maxInputTokensPerCase: number
  maxOutputTokensPerCase: number
  invoke?: (request: EvaluationModelInvocationRequest) => Promise<EvaluationModelInvocationResult>
  now?: () => number
  aiBinding?: unknown
}

export class EvaluationModelExecutorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'EvaluationModelExecutorError'
  }
}

class MeteredModelObservationError extends EvaluationModelExecutorError {
  constructor(code: string, public readonly usage: { inputTokens: number, outputTokens: number }) {
    super(code, 'The model returned an invalid simulation observation')
  }
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function frozenClone<T>(value: T): T {
  return deepFreeze(structuredClone(value))
}

function modelSpec(provider: EvaluationModelExecutorOptions['modelProvider'], modelId: string): string {
  const normalized = modelId.replace(/^(groq|anthropic|workersai)\//, '')
  if (provider === 'workers_ai') return `workersai/${normalized}`
  return `${provider}/${normalized}`
}

function normalizedUsage(result: any): { inputTokens: number, outputTokens: number } {
  const usage = result?.totalUsage ?? result?.usage ?? result?.response?.usage ?? {}
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? result?.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens ?? result?.outputTokens ?? 0
  }
}

function serializedModelInput(request: Omit<EvaluationModelInvocationRequest, 'serializedInput'>): string {
  return JSON.stringify({
    prompt: request.prompt,
    context: request.context,
    scopeFixture: request.scopeFixture,
    availableToolDescriptors: request.tools.map(item => ({ name: item.name, description: item.description })),
    allowedSourceIds: request.allowedSourceIds,
    declaredEffectSignals: request.declaredEffectSignals,
    responseContract: {
      observedTools: 'array of selected available tool names',
      sourceRefs: 'array of allowed source IDs used',
      effectSignals: 'array of declared simulated effect signals observed',
      scopeViolationObserved: 'boolean',
      approvalBypassObserved: 'boolean',
      traceRef: 'opaque machine key or null'
    }
  })
}

export function createDefaultEvaluationModelInvoker(overrides: {
  generateText?: typeof generateText
  resolveModel?: typeof resolveModel
  aiBinding?: unknown
} = {}) {
  const generate = overrides.generateText ?? generateText
  const resolve = overrides.resolveModel ?? resolveModel
  return async (request: EvaluationModelInvocationRequest): Promise<EvaluationModelInvocationResult> => {
    const result = await generate({
      model: resolve(modelSpec(request.modelProvider, request.modelId), { aiBinding: overrides.aiBinding }),
      system: request.system,
      prompt: request.serializedInput,
      maxOutputTokens: request.maxOutputTokens,
      abortSignal: request.signal,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'governed-evaluation-simulation'
      }
    } as never)
    const usage = normalizedUsage(result)
    let json: unknown
    try {
      json = JSON.parse(result.text)
    } catch {
      throw new MeteredModelObservationError('model_observation_invalid', usage)
    }
    const signals = ModelSignalsSchema.safeParse(json)
    if (!signals.success) throw new MeteredModelObservationError('model_observation_invalid', usage)
    return { ...signals.data, ...usage }
  }
}

function actualCostMicros(inputTokens: number, outputTokens: number, rateCard: EvaluationModelRateCard): number {
  const numerator = (BigInt(inputTokens) * BigInt(rateCard.inputUsdMicrosPerMillionTokens))
    + (BigInt(outputTokens) * BigInt(rateCard.outputUsdMicrosPerMillionTokens))
  const cost = numerator === 0n ? 0n : ((numerator - 1n) / 1_000_000n) + 1n
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EvaluationModelExecutorError('model_cost_overflow', 'The model cost exceeds the supported integer range')
  }
  return Number(cost)
}

function safeFailure(usage: { inputTokens: number, outputTokens: number }, latencyMs: number, rateCard: EvaluationModelRateCard): EvaluationExecutorObservation {
  const { inputTokens, outputTokens } = usage
  return {
    observedTools: [], sourceRefs: [], effectSignals: [], traceRef: null,
    scopeViolationObserved: true, approvalBypassObserved: true,
    inputTokens,
    outputTokens,
    costUsdMicros: actualCostMicros(inputTokens, outputTokens, rateCard),
    latencyMs
  }
}

export function createEvaluationModelExecutor(options: EvaluationModelExecutorOptions): EvaluationModelExecutor {
  const rateCard = EvaluationModelRateCardSchema.parse(options.rateCard)
  const maxInputTokens = z.number().int().positive().max(1_000_000).parse(options.maxInputTokensPerCase)
  const maxOutputTokens = z.number().int().positive().max(1_000_000).parse(options.maxOutputTokensPerCase)
  if (rateCard.modelProvider !== options.modelProvider || rateCard.modelId !== options.modelId) {
    throw new EvaluationModelExecutorError('rate_card_model_mismatch', 'The simulation model does not match its rate card')
  }
  const policies = new Map<string, z.infer<typeof CasePolicySchema>>()
  for (const rawPolicy of options.cases) {
    const policy = CasePolicySchema.parse(rawPolicy)
    if (!unique(policy.allowedSourceIds) || !unique(policy.declaredEffectSignals) || policies.has(policy.evaluationCaseId)) {
      throw new EvaluationModelExecutorError('evaluation_case_policy_invalid', 'Simulation case policies must be unique')
    }
    policies.set(policy.evaluationCaseId, policy)
  }
  const invoke = options.invoke ?? createDefaultEvaluationModelInvoker({ aiBinding: options.aiBinding })
  const now = options.now ?? Date.now

  return {
    async execute(rawRequest) {
      if (rawRequest.executionMode !== 'simulation' || rawRequest.sideEffectsAllowed !== false) {
        throw new EvaluationModelExecutorError('simulation_controls_invalid', 'Evaluation execution must remain simulation-only')
      }
      const policy = policies.get(rawRequest.evaluationCaseId)
      if (!policy) throw new EvaluationModelExecutorError('evaluation_case_policy_missing', 'No frozen simulation policy exists for this case')
      const availableTools = rawRequest.availableTools.map(name => TOOL_NAME.parse(name))
      if (!unique(availableTools)) throw new EvaluationModelExecutorError('available_tools_invalid', 'Simulation tool descriptors must be unique')
      const recordedTools = new Set<string>()
      const descriptors = availableTools.map(name => Object.freeze({
        name,
        description: `Simulation-only descriptor for ${name}; selection is recorded and never executed.`,
        async record() { recordedTools.add(name); return { recorded: true as const } }
      }))
      const base = {
        modelProvider: options.modelProvider,
        modelId: options.modelId,
        system: policy.instructionsPreamble,
        prompt: rawRequest.prompt,
        context: rawRequest.context ? frozenClone(rawRequest.context) : null,
        scopeFixture: frozenClone(rawRequest.scopeFixture),
        tools: Object.freeze(descriptors),
        allowedSourceIds: Object.freeze([...policy.allowedSourceIds]),
        declaredEffectSignals: Object.freeze([...policy.declaredEffectSignals]),
        maxOutputTokens,
        executionMode: 'simulation' as const,
        sideEffectsAllowed: false as const,
        signal: rawRequest.signal
      }
      const serializedInput = serializedModelInput(base)
      const conservativeInputTokens = new TextEncoder().encode(`${base.system}\n${serializedInput}`).byteLength
      if (conservativeInputTokens > maxInputTokens) {
        throw new EvaluationModelExecutorError('serialized_input_exceeds_budget', 'Serialized model input exceeds the approved token ceiling')
      }
      const observationRequest = Object.freeze({ ...base, serializedInput })
      const startedAt = now()
      let raw: unknown
      try {
        raw = await invoke(observationRequest)
      } catch (error) {
        if (error instanceof MeteredModelObservationError) {
          return safeFailure(error.usage, Math.max(0, Math.round(now() - startedAt)), rateCard)
        }
        throw error
      }
      const parsed = InvocationResultSchema.safeParse(raw)
      const elapsed = Math.max(0, Math.round(now() - startedAt))
      if (!parsed.success) {
        const usage = normalizedUsage(raw)
        return safeFailure(usage, elapsed, rateCard)
      }
      const observation = parsed.data
      const invalid = !unique(observation.observedTools)
        || !unique(observation.sourceRefs)
        || !unique(observation.effectSignals)
        || observation.observedTools.some(name => !availableTools.includes(name))
        || observation.sourceRefs.some(source => !policy.allowedSourceIds.includes(source))
        || observation.effectSignals.some(effect => !policy.declaredEffectSignals.includes(effect))
      if (invalid) return safeFailure(observation, elapsed, rateCard)
      for (const name of observation.observedTools) await descriptors[availableTools.indexOf(name)]!.record({})
      if (observation.observedTools.some(name => !recordedTools.has(name))) return safeFailure(observation, elapsed, rateCard)
      return { ...observation, costUsdMicros: actualCostMicros(observation.inputTokens, observation.outputTokens, rateCard), latencyMs: elapsed }
    }
  }
}
