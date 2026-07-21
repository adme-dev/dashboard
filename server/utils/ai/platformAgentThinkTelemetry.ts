import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
  type PlatformAgentMode,
  type PlatformAgentType
} from '~~/server/utils/ai/platformAgentRuns'
import type { PlatformAgentKey } from '~~/shared/utils/platformAgentScopeAssertion'

const DEFAULT_THINK_MODEL = '@cf/moonshotai/kimi-k2.7-code'

const AGENT_CONFIG: Record<PlatformAgentKey, {
  agentType: PlatformAgentType
  featureKey: string
  mode: PlatformAgentMode
}> = {
  'spend-controller': {
    agentType: 'spend_controller',
    featureKey: 'agent_spend_controller',
    mode: 'read_propose'
  },
  'publishing-planner': {
    agentType: 'publishing_planner',
    featureKey: 'agent_publishing_planner',
    mode: 'draft_only'
  },
  'financial-watch': {
    agentType: 'financial_watch',
    featureKey: 'agent_financial_watch',
    mode: 'read_only'
  },
  'traffic-controller': {
    agentType: 'traffic_controller',
    featureKey: 'agent_traffic_controller',
    mode: 'read_only'
  }
}

export interface PlatformAgentThinkTelemetry {
  requestId?: string
  status: 'completed' | 'error' | 'aborted' | 'skipped'
  provider: 'cloudflare-workers-ai'
  modelId: string
  stepCount: number
  toolCallCount: number
  toolFailureCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  finishReason: string | null
  failureStage: string | null
  recoveryExhausted: boolean
  durationMs: number
}

export interface PlatformAgentThinkRun {
  runId: string | null
  startedAtMs: number
  agent: PlatformAgentKey
  featureKey: string
  correlationId: string
  userId: string
  clientId: string | null
  tenantId: string | null
  deduplicated: boolean
}

export interface BeginPlatformAgentThinkTurnInput {
  agent: PlatformAgentKey
  correlationId: string
  userId: string
  clientId: string | null
  tenantId: string | null
  idempotencyKey?: string | null
}

function telemetrySummary(run: PlatformAgentThinkRun, telemetry: PlatformAgentThinkTelemetry) {
  return {
    transport: 'cloudflare_think',
    correlationId: run.correlationId,
    workerRequestId: telemetry.requestId ?? null,
    modelId: telemetry.modelId,
    finishReason: telemetry.finishReason,
    stepCount: telemetry.stepCount,
    toolCallCount: telemetry.toolCallCount,
    toolFailureCount: telemetry.toolFailureCount,
    cachedInputTokens: telemetry.cachedInputTokens,
    reasoningTokens: telemetry.reasoningTokens,
    failureStage: telemetry.failureStage,
    recoveryExhausted: telemetry.recoveryExhausted
  }
}

function invocationMetadata(run: PlatformAgentThinkRun, telemetry?: PlatformAgentThinkTelemetry) {
  return {
    source: 'platform_agent',
    transport: 'cloudflare_think',
    agentType: AGENT_CONFIG[run.agent].agentType,
    correlationId: run.correlationId,
    stepCount: telemetry?.stepCount ?? 0,
    toolCallCount: telemetry?.toolCallCount ?? 0,
    toolFailureCount: telemetry?.toolFailureCount ?? 0,
    cachedInputTokens: telemetry?.cachedInputTokens ?? 0,
    reasoningTokens: telemetry?.reasoningTokens ?? 0,
    finishReason: telemetry?.finishReason ?? null,
    failureStage: telemetry?.failureStage ?? 'transport',
    recoveryExhausted: telemetry?.recoveryExhausted ?? false
  }
}

export async function beginPlatformAgentThinkTurn(
  input: BeginPlatformAgentThinkTurnInput
): Promise<PlatformAgentThinkRun> {
  const config = AGENT_CONFIG[input.agent]
  const startedAtMs = Date.now()
  const started = await startPlatformAgentRun({
    agentType: config.agentType,
    featureKey: config.featureKey,
    mode: config.mode,
    userId: input.userId,
    clientId: input.clientId,
    route: '/agency/agents/think/turn',
    idempotencyKey: input.idempotencyKey,
    context: {
      transport: 'cloudflare_think',
      correlationId: input.correlationId,
      tenantId: input.tenantId
    }
  })

  return {
    runId: started.ok ? started.runId : null,
    startedAtMs,
    agent: input.agent,
    featureKey: config.featureKey,
    correlationId: input.correlationId,
    userId: input.userId,
    clientId: input.clientId,
    tenantId: input.tenantId,
    deduplicated: !started.ok && started.reason === 'duplicate'
  }
}

export async function completePlatformAgentThinkTurn(
  run: PlatformAgentThinkRun,
  telemetry: PlatformAgentThinkTelemetry
): Promise<void> {
  const writes: Promise<unknown>[] = []
  if (run.runId) {
    writes.push(completePlatformAgentRun({
      runId: run.runId,
      startedAtMs: run.startedAtMs,
      toolCallCount: telemetry.toolCallCount,
      summary: telemetrySummary(run, telemetry)
    }))
  }
  writes.push(recordAiInvocation({
    featureKey: run.featureKey,
    provider: telemetry.provider,
    modelId: telemetry.modelId,
    gatewayUsed: false,
    fallbackUsed: false,
    agentRunId: run.runId,
    userId: run.userId,
    clientId: run.clientId,
    requestId: telemetry.requestId ?? run.correlationId,
    promptTokens: telemetry.promptTokens,
    completionTokens: telemetry.completionTokens,
    totalTokens: telemetry.totalTokens,
    cachedInputTokens: telemetry.cachedInputTokens,
    status: 'success',
    latencyMs: telemetry.durationMs,
    metadata: invocationMetadata(run, telemetry)
  }))
  await Promise.allSettled(writes)
}

export async function failPlatformAgentThinkTurn(
  run: PlatformAgentThinkRun,
  input: {
    code: string
    modelId?: string
    telemetry?: PlatformAgentThinkTelemetry
  }
): Promise<void> {
  const telemetry = input.telemetry
  const summary = telemetry
    ? telemetrySummary(run, telemetry)
    : {
        transport: 'cloudflare_think',
        correlationId: run.correlationId,
        failureStage: 'transport',
        recoveryExhausted: false,
        toolFailureCount: 0
      }
  const writes: Promise<unknown>[] = []
  if (run.runId) {
    writes.push(failPlatformAgentRun({
      runId: run.runId,
      startedAtMs: run.startedAtMs,
      error: input.code,
      toolCallCount: telemetry?.toolCallCount ?? 0,
      summary
    }))
  }
  writes.push(recordAiInvocation({
    featureKey: run.featureKey,
    provider: telemetry?.provider ?? 'cloudflare-workers-ai',
    modelId: telemetry?.modelId ?? input.modelId ?? DEFAULT_THINK_MODEL,
    gatewayUsed: false,
    fallbackUsed: false,
    agentRunId: run.runId,
    userId: run.userId,
    clientId: run.clientId,
    requestId: telemetry?.requestId ?? run.correlationId,
    promptTokens: telemetry?.promptTokens,
    completionTokens: telemetry?.completionTokens,
    totalTokens: telemetry?.totalTokens,
    cachedInputTokens: telemetry?.cachedInputTokens,
    status: 'error',
    errorCode: input.code,
    latencyMs: telemetry?.durationMs ?? Math.max(0, Date.now() - run.startedAtMs),
    metadata: invocationMetadata(run, telemetry)
  }))
  await Promise.allSettled(writes)
}

export async function denyPlatformAgentThinkTurn(
  run: PlatformAgentThinkRun,
  input: {
    code: 'user_daily_turn_limit' | 'global_daily_turn_limit' | 'budget_unavailable'
    retryAfterSeconds: number
    resetAt?: string
  }
): Promise<void> {
  if (!run.runId) return
  await failPlatformAgentRun({
    runId: run.runId,
    startedAtMs: run.startedAtMs,
    error: input.code,
    summary: {
      transport: 'cloudflare_think',
      correlationId: run.correlationId,
      failureStage: 'admission',
      admissionCode: input.code,
      retryAfterSeconds: input.retryAfterSeconds,
      resetAt: input.resetAt ?? null,
      modelInvoked: false
    }
  })
}
