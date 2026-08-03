import { generateText, stepCountIs, tool } from 'ai'
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

const CasePolicySchema = z.strictObject({
  evaluationCaseId: UUID,
  instructionsPreamble: z.string().trim().min(1).max(20_000),
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
  const usage = result?.usage ?? result?.totalUsage ?? result?.response?.usage ?? {}
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens ?? 0
  }
}

function parseModelSignals(text: string): Pick<EvaluationModelInvocationResult,
  'sourceRefs' | 'effectSignals' | 'scopeViolationObserved' | 'approvalBypassObserved' | 'traceRef'> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new EvaluationModelExecutorError('model_observation_invalid', 'The model returned an invalid simulation observation')
  }
  const parsed = z.strictObject({
    sourceRefs: z.array(MACHINE_KEY).max(128),
    effectSignals: z.array(MACHINE_KEY).max(64),
    scopeViolationObserved: z.boolean(),
    approvalBypassObserved: z.boolean(),
    traceRef: MACHINE_KEY.nullable().default(null)
  }).safeParse(value)
  if (!parsed.success) {
    throw new EvaluationModelExecutorError('model_observation_invalid', 'The model returned an invalid simulation observation')
  }
  return parsed.data
}

function defaultInvoker(aiBinding?: unknown) {
  return async (request: EvaluationModelInvocationRequest): Promise<EvaluationModelInvocationResult> => {
    const descriptors = Object.fromEntries(request.tools.map(descriptor => [descriptor.name, tool({
      description: descriptor.description,
      inputSchema: z.object({}).passthrough(),
      execute: args => descriptor.record(args)
    })]))
    const result = await generateText({
      model: resolveModel(modelSpec(request.modelProvider, request.modelId), { aiBinding }),
      system: request.system,
      prompt: JSON.stringify({
        prompt: request.prompt,
        context: request.context,
        scopeFixture: request.scopeFixture,
        allowedSourceIds: request.allowedSourceIds,
        declaredEffectSignals: request.declaredEffectSignals,
        responseContract: {
          sourceRefs: 'array of allowed source IDs used',
          effectSignals: 'array of declared simulated effect signals observed',
          scopeViolationObserved: 'boolean',
          approvalBypassObserved: 'boolean',
          traceRef: 'opaque string or null'
        }
      }),
      tools: descriptors,
      stopWhen: stepCountIs(4),
      abortSignal: request.signal,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'governed-evaluation-simulation'
      }
    })
    const observedTools = (result.steps ?? [])
      .flatMap(step => step.toolCalls ?? [])
      .map(call => call.toolName)
    return {
      observedTools,
      ...parseModelSignals(result.text),
      ...normalizedUsage(result)
    }
  }
}

function actualCostMicros(
  inputTokens: number,
  outputTokens: number,
  rateCard: EvaluationModelRateCard
): number {
  const numerator = (BigInt(inputTokens) * BigInt(rateCard.inputUsdMicrosPerMillionTokens))
    + (BigInt(outputTokens) * BigInt(rateCard.outputUsdMicrosPerMillionTokens))
  const cost = numerator === 0n ? 0n : ((numerator - 1n) / 1_000_000n) + 1n
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new EvaluationModelExecutorError('model_cost_overflow', 'The model cost exceeds the supported integer range')
  }
  return Number(cost)
}

export function createEvaluationModelExecutor(options: EvaluationModelExecutorOptions): EvaluationModelExecutor {
  const rateCard = EvaluationModelRateCardSchema.parse(options.rateCard)
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
  const invoke = options.invoke ?? defaultInvoker(options.aiBinding)
  const now = options.now ?? Date.now

  return {
    async execute(rawRequest: Readonly<EvaluationExecutorRequest>): Promise<EvaluationExecutorObservation> {
      if (rawRequest.executionMode !== 'simulation' || rawRequest.sideEffectsAllowed !== false) {
        throw new EvaluationModelExecutorError('simulation_controls_invalid', 'Evaluation execution must remain simulation-only')
      }
      const policy = policies.get(rawRequest.evaluationCaseId)
      if (!policy) {
        throw new EvaluationModelExecutorError('evaluation_case_policy_missing', 'No frozen simulation policy exists for this case')
      }
      const availableTools = rawRequest.availableTools.map(toolName => TOOL_NAME.parse(toolName))
      if (!unique(availableTools)) {
        throw new EvaluationModelExecutorError('available_tools_invalid', 'Simulation tool descriptors must be unique')
      }
      const recordedTools = new Set<string>()
      const descriptors = availableTools.map(name => Object.freeze({
        name,
        description: `Simulation-only descriptor for ${name}. Selection is recorded; no handler, database, or vendor API is called.`,
        async record(_args: unknown) {
          recordedTools.add(name)
          return { recorded: true as const }
        }
      }))
      const startedAt = now()
      const observationRequest: EvaluationModelInvocationRequest = Object.freeze({
        modelProvider: options.modelProvider,
        modelId: options.modelId,
        system: policy.instructionsPreamble,
        prompt: rawRequest.prompt,
        context: rawRequest.context ? frozenClone(rawRequest.context) : null,
        scopeFixture: frozenClone(rawRequest.scopeFixture),
        tools: Object.freeze(descriptors),
        allowedSourceIds: Object.freeze([...policy.allowedSourceIds]),
        declaredEffectSignals: Object.freeze([...policy.declaredEffectSignals]),
        executionMode: 'simulation' as const,
        sideEffectsAllowed: false as const,
        signal: rawRequest.signal
      })
      const parsed = InvocationResultSchema.safeParse(await invoke(observationRequest))
      if (!parsed.success || !unique(parsed.data?.observedTools ?? []) || !unique(parsed.data?.sourceRefs ?? []) || !unique(parsed.data?.effectSignals ?? [])) {
        throw new EvaluationModelExecutorError('model_observation_invalid', 'The model returned an invalid simulation observation')
      }
      const observation = parsed.data
      if (observation.observedTools.some(name => !availableTools.includes(name))) {
        throw new EvaluationModelExecutorError('observation_tool_unavailable', 'The model selected a tool outside the frozen descriptor set')
      }
      if (observation.observedTools.some(name => !recordedTools.has(name))) {
        throw new EvaluationModelExecutorError('observation_tool_unrecorded', 'The model tool selection was not recorded by a simulation descriptor')
      }
      if (observation.sourceRefs.some(source => !policy.allowedSourceIds.includes(source))) {
        throw new EvaluationModelExecutorError('observation_source_unavailable', 'The model cited a source outside the frozen fixture')
      }
      if (observation.effectSignals.some(effect => !policy.declaredEffectSignals.includes(effect))) {
        throw new EvaluationModelExecutorError('observation_effect_undeclared', 'The model reported an effect outside the declared case signals')
      }
      const elapsed = Math.max(0, Math.round(now() - startedAt))
      return {
        ...observation,
        costUsdMicros: actualCostMicros(observation.inputTokens, observation.outputTokens, rateCard),
        latencyMs: elapsed
      }
    }
  }
}
