import { generateText, stepCountIs, type LanguageModel } from 'ai'
import { resolveModelWithTransport } from '~~/server/utils/claudeClient'
import { filterToolsForUser, toSdkTools } from './toolRegistry'
import { registry } from './tools/index'
import { DEFAULT_PERSONA, type Persona } from './personas'
import { spotlightSystemClause } from './spotlight'
import type { ToolContext } from './toolContext'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { resolveAiModelAssignment, type RuntimeModelProvider } from '~~/server/utils/ai/modelAssignments'
import {
  composeEffectiveAssistantTools,
  type ActiveCatalogRow,
  type CatalogRuntimePolicy
} from '~~/server/utils/ai/governance/catalogComposition'
import type { PermissionGroup } from '~~/server/utils/permissions'

export interface LoopOutput {
  text: string
  toolCalls: Array<{ name: string, args: unknown }>
  proposedAction: { proposalId: string, resolved: unknown, toolName: string } | null
  usage?: { inputTokens?: number, outputTokens?: number, totalTokens?: number }
  /** Estimated turn cost in USD (from usage + the model's price). */
  costUsd?: number
}

function normalizeUsage(result: any): LoopOutput['usage'] {
  const usage = result?.usage ?? result?.totalUsage ?? result?.response?.usage
  if (!usage) return undefined
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens
  const totalTokens = usage.totalTokens ?? usage.total_tokens
  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined
  return { inputTokens, outputTokens, totalTokens }
}

const STEP_CAP = 5
const DEADLINE_MS = 25_000

// $/Mtok (input, output). Keyed by the provider-relative model id (matched as a substring of the
// spec, e.g. 'groq/openai/gpt-oss-120b'). Rough — for budgeting/observability, not billing.
const PRICE_PER_MTOK: Record<string, { in: number, out: number }> = {
  'openai/gpt-oss-120b': { in: 0.15, out: 0.60 },
  'openai/gpt-oss-20b': { in: 0.10, out: 0.40 },
  'moonshotai/kimi-k2-instruct': { in: 1.0, out: 3.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
}

const DEFAULT_LOOP_MODEL_SPEC = 'groq/openai/gpt-oss-120b'
const DEFAULT_LOOP_FALLBACK_SPEC = 'groq/openai/gpt-oss-20b'

function providerFromSpec(spec: string): RuntimeModelProvider {
  if (spec.startsWith('anthropic/')) return 'anthropic'
  if (spec.startsWith('workersai/')) return 'workers_ai'
  return 'groq'
}

function modelIdFromSpec(spec: string): string {
  return spec.replace(/^(groq|anthropic|workersai)\//, '')
}

/** Estimate a turn's cost in USD from token usage + the model spec. Returns 0 when unknown. */
export function estimateCostUsd(usage: { inputTokens?: number, outputTokens?: number } | undefined, modelSpec = ''): number {
  return estimateKnownCostUsd(usage, modelSpec) ?? 0
}

function estimateKnownCostUsd(usage: { inputTokens?: number, outputTokens?: number } | undefined, modelSpec = ''): number | null {
  const entry = Object.entries(PRICE_PER_MTOK).find(([k]) => modelSpec.includes(k))?.[1]
  if (!entry || usage?.inputTokens == null || usage.outputTokens == null) return null
  return (usage.inputTokens * entry.in + usage.outputTokens * entry.out) / 1_000_000
}

function errorCode(error: unknown): string {
  const value = error as { code?: unknown, name?: unknown }
  const raw = typeof value?.code === 'string' ? value.code : typeof value?.name === 'string' ? value.name : 'provider_error'
  return raw.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 120) || 'provider_error'
}

/**
 * PURE extraction of the loop's output from a generateText result. Kept separate so the
 * trace + proposal-detection logic is unit-testable without a live/mock model.
 * Option B: a write proposal is read from the tool RESULT (a propose handler returned
 * { ok, data:{ proposalId, resolved } }) — not from any approval-request part. ANY propose tool
 * (create_task, propose_budget_change, …) surfaces this way; we carry the toolName so the confirm
 * card can render the right shape (e.g. a rich_confirm budget card). The last proposal in the turn
 * wins (a turn proposes at most one actionable write).
 */
export function extractLoopOutput(result: any): LoopOutput {
  const steps: any[] = result?.steps ?? []
  const toolCalls = steps
    .flatMap(s => s?.toolCalls ?? [])
    .map((c: any) => ({ name: c.toolName, args: c.input }))

  let proposedAction: LoopOutput['proposedAction'] = null
  for (const s of steps) {
    for (const r of (s?.toolResults ?? [])) {
      const out = r?.output
      if (out?.ok && out?.data?.proposalId && r?.toolName) {
        proposedAction = { proposalId: out.data.proposalId, resolved: out.data.resolved, toolName: r.toolName }
      }
    }
  }
  return { text: result?.text ?? '', toolCalls, proposedAction, usage: normalizeUsage(result) }
}

/**
 * Run the gated agentic loop (AI SDK v6). Filters tools by RBAC (+ optional persona allowlist),
 * runs generateText with a step cap + wall-clock deadline, and falls back to a second provider on
 * failure. Returns the final text, the read-tool trace, and any create_task proposal (Option B).
 */
export async function runToolLoop(opts: {
  ctx: ToolContext
  system: string
  messages: any[]
  persona?: Persona
  seed: string
  modelSpec?: string
  fallbackSpec?: string
  /** Test injection — bypasses resolveModel. */
  model?: LanguageModel
  fallbackModel?: LanguageModel
  signal?: AbortSignal
  /** Exclude mutating (propose) tools — used for L2 controller sub-runs so a delegated specialist
   *  can only READ; it can never stage a write proposal that would persist as an orphan. */
  readOnly?: boolean
  /** The user's self-disabled tools (config narrows, never grants — applied by subtraction). */
  disabledTools?: string[]
  /** Evaluated release controls for the actor's server-derived department scope. */
  catalogRows?: ActiveCatalogRow[]
  /** Current server-resolved permissions used as an additional catalog capability gate. */
  permissionGroups?: PermissionGroup[]
  /** Private server-validated rollout policy resolved during turn admission. */
  runtimePolicy?: CatalogRuntimePolicy
  /** Avoid repeating the catalog preamble when a caller already included it for its fast path. */
  catalogInstructionsAlreadyIncluded?: boolean
  /** Model Ops telemetry metadata. Content/prompts are never recorded. */
  featureKey?: string
  clientId?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
  /** One server-generated identity shared by all model attempts that produce a user-visible reply. */
  turnId?: string
  /** Stable identity for this loop within the turn (for example l1 or l2:finance). */
  loopId?: string
  /** Correlation only. Durable ai_pilot_task_evidence is the authority. */
  pilotEvidenceId?: string
}): Promise<LoopOutput> {
  const cfg = useRuntimeConfig() as any
  const persona = opts.persona ?? DEFAULT_PERSONA

  const composition = composeEffectiveAssistantTools({
    rbacFilteredTools: filterToolsForUser(
      registry,
      opts.ctx.userRole,
      opts.permissionGroups,
      opts.ctx.assistantReadOnly
    ),
    catalogRows: opts.catalogRows ?? [],
    grantedPermissionGroups: opts.permissionGroups ?? [],
    personaToolAllowlist: persona.toolAllowlist,
    readOnly: opts.readOnly,
    disabledTools: opts.disabledTools,
    runtimePolicy: opts.runtimePolicy
  })
  const tools = composition.tools
  const sdkTools = toSdkTools(tools, opts.ctx, opts.seed)
  const turnId = opts.turnId ?? crypto.randomUUID()
  const loopId = opts.loopId ?? 'l1'

  const system = [
    opts.system,
    opts.catalogInstructionsAlreadyIncluded ? '' : composition.instructionsPreamble,
    persona.instructionsPreamble,
    spotlightSystemClause()
  ]
    .filter(Boolean)
    .join('\n\n')

  // Fresh deadline per attempt: if a caller signal is injected both attempts share it, otherwise
  // each gets its own timeout so a primary TIMEOUT doesn't instantly abort the fallback too.
  const deadlineMs = Math.min(DEADLINE_MS, composition.budget?.maxLatencyMs ?? DEADLINE_MS)
  const run = (m: LanguageModel) => generateText({
    model: m,
    system,
    messages: opts.messages,
    tools: sdkTools,
    stopWhen: [stepCountIs(STEP_CAP)],
    abortSignal: opts.signal ?? AbortSignal.timeout(deadlineMs),
    maxOutputTokens: composition.budget?.maxOutputTokens,
    // OTel GenAI spans — metadata only (no prompt/arg/output capture). No-op unless a tracer is registered.
    experimental_telemetry: { isEnabled: true, recordInputs: false, recordOutputs: false, functionId: 'ai-tool-loop' },
  })

  const configuredPrimarySpec = opts.modelSpec ?? cfg.aiLoopModel ?? DEFAULT_LOOP_MODEL_SPEC
  const configuredFallbackSpec = opts.fallbackSpec ?? cfg.aiLoopFallbackModel ?? DEFAULT_LOOP_FALLBACK_SPEC
  const assignment = opts.model
    ? null
    : await resolveAiModelAssignment({
        featureKey: opts.featureKey ?? 'agency_ai_tool_loop',
        defaultProvider: providerFromSpec(configuredPrimarySpec),
        defaultModelId: modelIdFromSpec(configuredPrimarySpec),
        defaultFallbackModelId: configuredFallbackSpec ? modelIdFromSpec(configuredFallbackSpec) : null,
        supportedProviders: ['groq', 'anthropic', 'workers_ai'],
      })
  const primarySpec = opts.modelSpec ?? assignment?.modelSpec ?? configuredPrimarySpec
  const fallbackSpec = opts.fallbackSpec ?? assignment?.fallbackModelSpec ?? configuredFallbackSpec
  // Workers AI models (workersai/@cf/...) resolve via the request's edge AI binding.
  const aiBinding = (opts.ctx.event?.context as any)?.cloudflare?.env?.AI
  let usedSpec: string = opts.model ? 'injected' : primarySpec
  let fallbackUsed = false
  let result
  let successfulAttemptStartedAt: number
  const baseMetadata = {
    ...(opts.metadata ?? {}),
    persona: persona.key,
    readOnly: Boolean(opts.readOnly),
    toolCount: tools.length,
    catalogMode: composition.mode,
    catalogRuntimeMode: opts.runtimePolicy?.mode ?? 'legacy',
    catalogCoverageStatus: composition.coverageStatus,
    catalogReleaseIds: composition.releaseIds,
    catalogPackVersionIds: composition.packVersionIds,
    catalogCapabilityVersionIds: composition.capabilityVersionIds,
    catalogDenials: composition.denials.slice(0, 100),
    injectedModel: Boolean(opts.model),
    modelAssignmentSource: assignment?.source ?? 'default',
    modelAssignmentIgnoredReason: assignment?.ignoredReason ?? null,
    turnId,
    loopId,
    ...(opts.pilotEvidenceId ? { pilotEvidenceId: opts.pilotEvidenceId } : {})
  }
  const recordAttempt = async (input: {
    spec: string
    gatewayUsed: boolean
    role: 'primary' | 'fallback'
    status: 'success' | 'error'
    terminal: boolean
    fallbackUsed: boolean
    startedAt: number
    output?: LoopOutput
    error?: unknown
  }) => {
    await recordAiInvocation({
      featureKey: opts.featureKey ?? 'agency_ai_tool_loop',
      provider: input.spec.startsWith('anthropic/') ? 'anthropic' : input.spec.startsWith('workersai/') ? 'workers_ai' : 'groq',
      modelId: input.spec.replace(/^(groq|anthropic|workersai)\//, ''),
      gatewayUsed: input.gatewayUsed,
      fallbackUsed: input.fallbackUsed,
      userId: opts.ctx.userId,
      clientId: opts.clientId ?? null,
      requestId: opts.requestId ?? null,
      promptTokens: input.output?.usage?.inputTokens ?? null,
      completionTokens: input.output?.usage?.outputTokens ?? null,
      totalTokens: input.output?.usage?.totalTokens ?? null,
      estimatedCostUsd: input.output ? estimateKnownCostUsd(input.output.usage, input.spec) : null,
      status: input.status,
      errorCode: input.error ? errorCode(input.error) : null,
      latencyMs: Date.now() - input.startedAt,
      metadata: {
        ...baseMetadata,
        attemptId: `${turnId}:${loopId}:${input.role}`,
        attemptRole: input.role,
        terminal: input.terminal,
        toolCalls: input.output?.toolCalls.map(call => call.name).slice(0, 20) ?? [],
        proposedTool: input.output?.proposedAction?.toolName ?? null
      }
    })
  }
  const primaryStartedAt = Date.now()
  let usedGatewayUsed = false
  try {
    const primary = opts.model
      ? { model: opts.model, gatewayUsed: false }
      : resolveModelWithTransport(primarySpec, { aiBinding })
    usedGatewayUsed = primary.gatewayUsed
    result = await run(primary.model)
    successfulAttemptStartedAt = primaryStartedAt
  } catch (err) {
    // Provider/gateway failure → ordered fallback to a second model.
    let fb: { model: LanguageModel, gatewayUsed: boolean } | null = null
    try {
      fb = opts.fallbackModel
        ? { model: opts.fallbackModel, gatewayUsed: false }
        : fallbackSpec
          ? resolveModelWithTransport(fallbackSpec, { aiBinding })
          : null
    } catch {
      await recordAttempt({ spec: usedSpec, gatewayUsed: usedGatewayUsed, role: 'primary', status: 'error', terminal: true, fallbackUsed: false, startedAt: primaryStartedAt, error: err })
      throw err
    }
    await recordAttempt({ spec: usedSpec, gatewayUsed: usedGatewayUsed, role: 'primary', status: 'error', terminal: !fb, fallbackUsed: false, startedAt: primaryStartedAt, error: err })
    if (!fb) throw err
    usedSpec = opts.fallbackModel ? 'injected' : fallbackSpec
    usedGatewayUsed = fb.gatewayUsed
    fallbackUsed = true
    const fallbackStartedAt = Date.now()
    try {
      result = await run(fb.model)
      successfulAttemptStartedAt = fallbackStartedAt
    } catch (fallbackError) {
      await recordAttempt({ spec: usedSpec, gatewayUsed: usedGatewayUsed, role: 'fallback', status: 'error', terminal: true, fallbackUsed: true, startedAt: fallbackStartedAt, error: fallbackError })
      throw fallbackError
    }
  }

  const out = extractLoopOutput(result)
  const knownCost = estimateKnownCostUsd(out.usage, usedSpec)
  if (knownCost !== null) out.costUsd = knownCost
  await recordAttempt({
    spec: usedSpec,
    gatewayUsed: usedGatewayUsed,
    role: fallbackUsed ? 'fallback' : 'primary',
    status: 'success',
    terminal: true,
    fallbackUsed,
    startedAt: successfulAttemptStartedAt,
    output: out
  })
  return out
}
