import {
  Think,
  type ChatErrorContext,
  type ChatRecoveryExhaustedContext,
  type ChatResponseResult,
  type StepContext,
  type ToolCallResultContext,
  type TurnConfig,
  type TurnContext,
} from '@cloudflare/think'
import { getAgentByName } from 'agents'
import { tool } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import {
  PLATFORM_AGENT_KEYS,
  type PlatformAgentKey,
  type PlatformAgentScopeAssertionClaims,
  verifyPlatformAgentScopeAssertion,
} from '../../../shared/utils/platformAgentScopeAssertion'

interface SpendControllerBridgeBody {
  prompt?: unknown
  context?: unknown
}

interface PublishingPlannerBridgeBody {
  prompt?: unknown
  context?: unknown
}

interface FinancialWatchBridgeBody {
  prompt?: unknown
  context?: unknown
}

interface TrafficControllerBridgeBody {
  prompt?: unknown
  context?: unknown
}

export interface Env {
  AI: Ai
  APP_BASE_URL: string
  INTERNAL_API_KEY?: string
  PLATFORM_AGENT_SCOPE_SIGNING_SECRET?: string
  THINK_MODEL?: string
  THINK_TURNS_ENABLED?: string
  SpendControllerAgent: DurableObjectNamespace<SpendControllerAgent>
  PublishingPlannerAgent: DurableObjectNamespace<PublishingPlannerAgent>
  FinancialWatchAgent: DurableObjectNamespace<FinancialWatchAgent>
  TrafficControllerAgent: DurableObjectNamespace<TrafficControllerAgent>
}

const PLATFORM_AGENT_MAX_STEPS = 4
const PLATFORM_AGENT_MAX_OUTPUT_TOKENS = 2_048
const PLATFORM_AGENT_STREAM_STALL_TIMEOUT_MS = 60_000
const PLATFORM_AGENT_MAX_PROMPT_LENGTH = 8_000
const PLATFORM_AGENT_MAX_REQUEST_BODY_LENGTH = 16_384

interface ActivePlatformAgentBinding {
  scopeAssertion: string
  claims: PlatformAgentScopeAssertionClaims
}

interface GovernedTurnInput {
  prompt: string
  scopeAssertion: string
}

interface GovernedTurnResult {
  requestId: string
  status: string
  text?: string
  telemetry: PlatformAgentTurnTelemetryResult
}

interface PlatformAgentTurnTelemetry {
  startedAt: number
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
  requestId: string | null
  status: 'completed' | 'error' | 'aborted'
}

interface PlatformAgentTurnTelemetryResult {
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

function boundedTelemetryInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100_000_000, Math.max(0, Math.round(parsed)))
}

abstract class GovernedPlatformThinkAgent extends Think<Env> {
  override workspaceBash = false
  override maxSteps = PLATFORM_AGENT_MAX_STEPS
  override sendReasoning = false
  override chatStreamStallTimeoutMs = PLATFORM_AGENT_STREAM_STALL_TIMEOUT_MS
  override chatRecovery = {
    maxAttempts: 2,
    noProgressTimeoutMs: PLATFORM_AGENT_STREAM_STALL_TIMEOUT_MS,
    maxRecoveryWork: 64,
    maxOomRetries: 1,
    terminalMessage: 'The assistant turn was interrupted. Please try again.',
    onExhausted: async (ctx: ChatRecoveryExhaustedContext) => {
      if (this.activeTelemetry) {
        this.activeTelemetry.status = 'error'
        this.activeTelemetry.requestId = ctx.requestId || this.activeTelemetry.requestId
        this.activeTelemetry.failureStage = 'recovery'
        this.activeTelemetry.recoveryExhausted = true
      }

      try {
        const scopeAssertion = this.activeTurnMetadata?.platformAgentScopeAssertion
        const binding = await this.verifyTurnBinding(scopeAssertion)
        const authorization = expectedAuth(this.env)
        if (!authorization) return
        await fetch(`${this.env.APP_BASE_URL}/api/internal/platform-agents/think/recovery-exhausted`, {
          method: 'POST',
          headers: {
            authorization,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            agent: this.agentKey(),
            instanceId: this.name,
            scopeAssertion: binding.scopeAssertion,
            requestId: ctx.requestId,
            recoveryRootRequestId: ctx.recoveryRootRequestId,
            modelId: this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code',
          }),
        })
      } catch {
        // Cloudflare's native recovery event remains the fallback; recovery must never loop on telemetry failure.
      }
    },
  }

  private activeBinding: ActivePlatformAgentBinding | null = null
  private activeTelemetry: PlatformAgentTurnTelemetry | null = null
  private telemetryByAssertion = new Map<string, PlatformAgentTurnTelemetry[]>()

  protected abstract agentKey(): PlatformAgentKey
  protected abstract activeDomainTools(): readonly string[]

  protected requiredPermissions(): readonly string[] {
    switch (this.agentKey()) {
      case 'spend-controller':
        return ['MEDIA_BUYING']
      case 'publishing-planner':
        return ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE']
      case 'financial-watch':
        return ['FINANCE']
      case 'traffic-controller':
        return ['ADMIN']
    }
  }

  private async verifyTurnBinding(scopeAssertion: unknown): Promise<ActivePlatformAgentBinding> {
    this.activeBinding = null
    if (typeof scopeAssertion !== 'string') throw new Error('Unauthorized platform agent turn')
    const secret = this.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET
    const claims = secret
      ? await verifyPlatformAgentScopeAssertion({
          token: scopeAssertion,
          secret,
          expectedAgent: this.agentKey(),
          expectedInstanceId: this.name,
        })
      : null
    if (!claims || !this.requiredPermissions().some(permission => claims.permissions.includes(permission))) {
      throw new Error('Unauthorized platform agent turn')
    }
    return { scopeAssertion, claims }
  }

  override async beforeTurn(_ctx: TurnContext): Promise<TurnConfig> {
    this.activeBinding = await this.verifyTurnBinding(this.activeTurnMetadata?.platformAgentScopeAssertion)
    const telemetry: PlatformAgentTurnTelemetry = {
      startedAt: Date.now(),
      stepCount: 0,
      toolCallCount: 0,
      toolFailureCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      finishReason: null,
      failureStage: null,
      recoveryExhausted: false,
      requestId: null,
      status: 'completed',
    }
    const assertionId = this.activeBinding.claims.jti
    const queued = this.telemetryByAssertion.get(assertionId) ?? []
    queued.push(telemetry)
    this.telemetryByAssertion.set(assertionId, queued)
    this.activeTelemetry = telemetry
    return {
      activeTools: [...this.activeDomainTools()],
      maxSteps: PLATFORM_AGENT_MAX_STEPS,
      maxOutputTokens: PLATFORM_AGENT_MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      sendReasoning: false,
    }
  }

  override onStepFinish(ctx: StepContext): void {
    if (!this.activeTelemetry) return
    this.activeTelemetry.stepCount = Math.max(this.activeTelemetry.stepCount, ctx.stepNumber + 1)
    this.activeTelemetry.toolCallCount += ctx.toolCalls.length
    this.activeTelemetry.promptTokens += boundedTelemetryInteger(ctx.usage?.inputTokens)
    this.activeTelemetry.completionTokens += boundedTelemetryInteger(ctx.usage?.outputTokens)
    this.activeTelemetry.totalTokens += boundedTelemetryInteger(ctx.usage?.totalTokens)
    this.activeTelemetry.cachedInputTokens += boundedTelemetryInteger(ctx.usage?.cachedInputTokens)
    this.activeTelemetry.reasoningTokens += boundedTelemetryInteger(ctx.usage?.reasoningTokens)
    this.activeTelemetry.finishReason = typeof ctx.finishReason === 'string'
      ? ctx.finishReason.slice(0, 64)
      : null
  }

  override afterToolCall(ctx: ToolCallResultContext): void {
    if (this.activeTelemetry && !ctx.success) this.activeTelemetry.toolFailureCount += 1
  }

  override onChatResponse(result: ChatResponseResult): void {
    if (!this.activeTelemetry) return
    this.activeTelemetry.requestId = result.requestId
    this.activeTelemetry.status = result.status
  }

  override onChatError(_error: unknown, ctx?: ChatErrorContext): unknown {
    if (this.activeTelemetry) {
      this.activeTelemetry.status = 'error'
      this.activeTelemetry.requestId = ctx?.requestId ?? this.activeTelemetry.requestId
      this.activeTelemetry.failureStage = ctx?.stage ?? 'turn'
      this.activeTelemetry.recoveryExhausted = ctx?.classification === 'context_overflow'
    }
    return new Error('Platform agent turn failed')
  }

  protected requireActiveBinding(): ActivePlatformAgentBinding {
    if (!this.activeBinding) throw new Error('Unauthorized platform agent tool call')
    return this.activeBinding
  }

  protected scopedClientId(requestedClientId: string | undefined, required = false): string | undefined {
    const { claims } = this.requireActiveBinding()
    if (claims.clientScopeKind === 'single') {
      const clientId = claims.clientIds[0]!
      if (requestedClientId && requestedClientId !== clientId) {
        throw new Error('Client is outside the authorized platform agent scope')
      }
      return clientId
    }
    if (requestedClientId && !claims.clientIds.includes(requestedClientId)) {
      throw new Error('Client is outside the authorized platform agent scope')
    }
    if (required && !requestedClientId) throw new Error('Authorized client is required')
    return requestedClientId
  }

  protected scopedTenantId(requestedTenantId: string | undefined, required = false): string | undefined {
    const { claims } = this.requireActiveBinding()
    const tenantId = claims.tenantId ?? undefined
    if (requestedTenantId && requestedTenantId !== tenantId) {
      throw new Error('Tenant is outside the authorized platform agent scope')
    }
    if (required && !tenantId) throw new Error('Authorized tenant is required')
    return tenantId
  }

  async runGovernedTurn(input: GovernedTurnInput): Promise<GovernedTurnResult> {
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : ''
    if (!prompt || prompt.length > PLATFORM_AGENT_MAX_PROMPT_LENGTH) {
      throw new Error('Invalid platform agent prompt')
    }
    const binding = await this.verifyTurnBinding(input.scopeAssertion)
    let requestId = ''
    let status: 'completed' | 'error' | 'aborted' = 'completed'
    const admissionStartedAt = Date.now()
    try {
      await this.chat(prompt, {
        onStart(event) {
          requestId = event.requestId
        },
        onEvent() {},
        onDone() {},
        onError() {
          status = 'error'
        },
      }, {
        metadata: { platformAgentScopeAssertion: input.scopeAssertion },
      })
    } catch (error) {
      status = 'error'
      void error
    }
    const assertionId = binding.claims.jti
    const queued = this.telemetryByAssertion.get(assertionId) ?? []
    const telemetry = queued.shift()
    if (queued.length > 0) this.telemetryByAssertion.set(assertionId, queued)
    else this.telemetryByAssertion.delete(assertionId)
    const finalStatus = telemetry?.status === 'error' || status === 'error'
      ? 'error'
      : telemetry?.status ?? status
    const durationMs = Math.max(0, Date.now() - (telemetry?.startedAt ?? admissionStartedAt))
    const telemetryResult: PlatformAgentTurnTelemetryResult = {
      provider: 'cloudflare-workers-ai',
      modelId: this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code',
      stepCount: telemetry?.stepCount ?? 0,
      toolCallCount: telemetry?.toolCallCount ?? 0,
      toolFailureCount: telemetry?.toolFailureCount ?? 0,
      promptTokens: telemetry?.promptTokens ?? 0,
      completionTokens: telemetry?.completionTokens ?? 0,
      totalTokens: telemetry?.totalTokens ?? 0,
      cachedInputTokens: telemetry?.cachedInputTokens ?? 0,
      reasoningTokens: telemetry?.reasoningTokens ?? 0,
      finishReason: telemetry?.finishReason ?? null,
      failureStage: telemetry?.failureStage ?? null,
      recoveryExhausted: telemetry?.recoveryExhausted ?? false,
      durationMs,
    }
    requestId = requestId || telemetry?.requestId || ''
    console.log(JSON.stringify({
      event: 'platform_agent_turn',
      correlationId: binding.claims.correlationId,
      agent: this.agentKey(),
      requestId: requestId || null,
      status: finalStatus,
      stepCount: telemetryResult.stepCount,
      toolCallCount: telemetryResult.toolCallCount,
      toolFailureCount: telemetryResult.toolFailureCount,
      failureStage: telemetryResult.failureStage,
      recoveryExhausted: telemetryResult.recoveryExhausted,
      durationMs,
    }))
    let text = ''
    if (finalStatus === 'completed') {
      const messages = await this.getMessages()
      const assistant = [...messages].reverse().find(message => message.role === 'assistant')
      text = assistant?.parts
        .filter((part): part is typeof part & { type: 'text', text: string } => part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim() ?? ''
    }
    return {
      requestId,
      status: finalStatus,
      ...(text ? { text } : {}),
      telemetry: telemetryResult,
    }
  }
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function expectedAuth(env: Env): string | null {
  const key = env.INTERNAL_API_KEY?.trim()
  return key ? `Bearer ${key}` : null
}

async function fixedLengthDigestEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!
  }
  return difference === 0
}

export async function verifyServiceAuthorization(request: Request, env: Env): Promise<boolean> {
  const expected = expectedAuth(env)
  const provided = request.headers.get('authorization')
  if (!expected || !provided) return false
  return fixedLengthDigestEqual(provided, expected)
}

async function callAppBridge(
  env: Env,
  path: string,
  body: { prompt?: unknown, context?: unknown },
  binding?: ActivePlatformAgentBinding,
) {
  const expected = expectedAuth(env)
  if (!expected) {
    throw new Error('INTERNAL_API_KEY is not configured')
  }
  const prompt = String(body.prompt || '').trim()
  if (!prompt) {
    throw new Error('prompt required')
  }

  const appBaseUrl = env.APP_BASE_URL || 'https://app.xeroflow.io'
  const response = await fetch(`${appBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: expected,
      'content-type': 'application/json',
      ...(binding ? { 'x-platform-agent-scope-assertion': binding.scopeAssertion } : {}),
    },
    body: JSON.stringify({
      prompt,
      context: body.context && typeof body.context === 'object' ? body.context : {},
      draftActions: false,
    }),
  })

  const payload = await response.json().catch(() => ({
    ok: false,
    error: `App bridge returned ${response.status}`,
  }))
  if (!response.ok) {
    throw new Error(typeof (payload as any).error === 'string' ? (payload as any).error : `App bridge returned ${response.status}`)
  }
  return payload
}

async function callSpendControllerAppBridge(env: Env, body: SpendControllerBridgeBody, binding?: ActivePlatformAgentBinding) {
  return callAppBridge(env, '/api/internal/platform-agents/spend-controller/ask', body, binding)
}

async function callPublishingPlannerAppBridge(env: Env, body: PublishingPlannerBridgeBody, binding?: ActivePlatformAgentBinding) {
  return callAppBridge(env, '/api/internal/platform-agents/publishing-planner/ask', body, binding)
}

async function callFinancialWatchAppBridge(env: Env, body: FinancialWatchBridgeBody, binding?: ActivePlatformAgentBinding) {
  return callAppBridge(env, '/api/internal/platform-agents/financial-watch/ask', body, binding)
}

async function callTrafficControllerAppBridge(env: Env, body: TrafficControllerBridgeBody, binding?: ActivePlatformAgentBinding) {
  return callAppBridge(env, '/api/internal/platform-agents/traffic-controller/ask', body, binding)
}

async function handleSpendControllerBridge(request: Request, env: Env): Promise<Response> {
  if (!(await verifyServiceAuthorization(request, env))) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as SpendControllerBridgeBody
  try {
    const payload = await callSpendControllerAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

async function handlePublishingPlannerBridge(request: Request, env: Env): Promise<Response> {
  if (!(await verifyServiceAuthorization(request, env))) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as PublishingPlannerBridgeBody
  try {
    const payload = await callPublishingPlannerAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

async function handleFinancialWatchBridge(request: Request, env: Env): Promise<Response> {
  if (!(await verifyServiceAuthorization(request, env))) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as FinancialWatchBridgeBody
  try {
    const payload = await callFinancialWatchAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

async function handleTrafficControllerBridge(request: Request, env: Env): Promise<Response> {
  if (!(await verifyServiceAuthorization(request, env))) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as TrafficControllerBridgeBody
  try {
    const payload = await callTrafficControllerAppBridge(env, body)
    return json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'prompt required' ? 400 : 502
    return json({ ok: false, error: message }, { status })
  }
}

export class SpendControllerAgent extends GovernedPlatformThinkAgent {
  protected agentKey() {
    return 'spend-controller' as const
  }

  protected activeDomainTools() {
    return ['reviewSpendPacing'] as const
  }

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Spend Controller Agent.',
      'Use read-only platform data to identify spend pacing risks, stale syncs, and safe next steps.',
      'Never execute budget, bid, campaign, publishing, payment, or account changes directly.',
      'When an action is needed, produce an explainable recommendation and require human approval in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewSpendPacing: tool({
        description: 'Read current Meta and Google Ads spend pacing, stale syncs, and safe recommendations from the XeroFlow app.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The spend question to answer.'),
          period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Reporting period in YYYY-MM format.'),
          platform: z.enum(['all', 'meta', 'google', 'google_ads']).optional().describe('Platform filter.'),
          clientId: z.string().optional().describe('Optional client id filter when supplied by the app.'),
        }),
        execute: async ({ prompt, period, platform, clientId }) => {
          const binding = this.requireActiveBinding()
          return callSpendControllerAppBridge(this.env, {
            prompt,
            context: {
              period,
              platform,
              clientId: this.scopedClientId(clientId),
            },
          }, binding)
        },
      }),
    }
  }
}

export class PublishingPlannerAgent extends GovernedPlatformThinkAgent {
  protected agentKey() {
    return 'publishing-planner' as const
  }

  protected activeDomainTools() {
    return ['reviewPublishingPlan', 'draftPublishingPlan'] as const
  }

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Publishing Planner Agent.',
      'Use read-only planner, queue, slot, campaign, and connection data to identify scheduling risks and draft-safe next steps.',
      'Never schedule, approve, publish, delete, or mutate posts directly.',
      'When a plan is needed, recommend draft-only actions that require human review in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewPublishingPlan: tool({
        description: 'Read the current publishing planner state for a client, including campaigns, queue, slots, accounts, and upcoming scheduled posts.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The planner question to answer.'),
          clientId: z.string().min(1).optional().describe('Optional client id. The server supplies the assertion-bound client when omitted.'),
        }),
        execute: async ({ prompt, clientId }) => {
          const binding = this.requireActiveBinding()
          return callPublishingPlannerAppBridge(this.env, {
            prompt,
            context: { clientId: this.scopedClientId(clientId, true) },
          }, binding)
        },
      }),
      draftPublishingPlan: tool({
        description: 'Generate editable draft-only social post suggestions for a client. This never schedules, publishes, approves, deletes, or creates posts.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The draft plan brief or request.'),
          clientId: z.string().min(1).optional().describe('Optional client id. The server supplies the assertion-bound client when omitted.'),
          campaignId: z.string().optional().describe('Optional campaign id for the generated draft suggestions.'),
          count: z.number().int().min(1).max(14).optional().describe('Number of draft suggestions to return.'),
          dateFrom: z.string().optional().describe('Optional ISO start date for suggested draft schedule hints.'),
          dateTo: z.string().optional().describe('Optional ISO end date for suggested draft schedule hints.'),
          tone: z.string().optional().describe('Optional tone for generated draft suggestions.'),
          platforms: z.array(z.string()).optional().describe('Target social platforms for the draft suggestions.'),
        }),
        execute: async ({ prompt, clientId, campaignId, count, dateFrom, dateTo, tone, platforms }) => {
          const binding = this.requireActiveBinding()
          return callPublishingPlannerAppBridge(this.env, {
            prompt,
            context: {
              clientId: this.scopedClientId(clientId, true),
              campaignId,
              count,
              dateFrom,
              dateTo,
              tone,
              platforms,
              draftPlan: true,
            },
          }, binding)
        },
      }),
    }
  }
}

export class FinancialWatchAgent extends GovernedPlatformThinkAgent {
  protected agentKey() {
    return 'financial-watch' as const
  }

  protected activeDomainTools() {
    return ['reviewFinancialWatch'] as const
  }

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Financial Watch Agent.',
      'Use stored financial advisor reports, active recommendations, and budget alerts to identify financial risk.',
      'Never create invoices, send reminders, change budgets, update Xero, or mutate recommendations directly.',
      'When action is needed, return an explainable read-only recommendation for a human to review in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewFinancialWatch: tool({
        description: 'Read stored financial advisor reports, recommendations, and budget alerts for a tenant. This never mutates Xero, invoices, budgets, or recommendations.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The financial risk question to answer.'),
          tenantId: z.string().min(1).optional().describe('Optional tenant id. The server supplies the assertion-bound tenant when omitted.'),
          clientId: z.string().optional().describe('Optional agency client id for scoped recommendations and budget alerts.'),
        }),
        execute: async ({ prompt, tenantId, clientId }) => {
          const binding = this.requireActiveBinding()
          return callFinancialWatchAppBridge(this.env, {
            prompt,
            context: {
              tenantId: this.scopedTenantId(tenantId, true),
              clientId: this.scopedClientId(clientId),
            },
          }, binding)
        },
      }),
    }
  }
}

export class TrafficControllerAgent extends GovernedPlatformThinkAgent {
  protected agentKey() {
    return 'traffic-controller' as const
  }

  protected activeDomainTools() {
    return ['reviewTrafficControl'] as const
  }

  getModel() {
    const model = this.env.THINK_MODEL || '@cf/moonshotai/kimi-k2.7-code'
    return createWorkersAI({ binding: this.env.AI })(model as any)
  }

  getSystemPrompt() {
    return [
      'You are the XeroFlow Traffic Controller Agent.',
      'Use platform-agent signals from spend, publishing, and finance to recommend operational allocation priorities.',
      'Never mutate budgets, posts, invoices, recommendations, campaigns, or Xero directly.',
      'Return read-only allocation recommendations that a human can review in the app.',
    ].join(' ')
  }

  getTools() {
    return {
      reviewTrafficControl: tool({
        description: 'Read recent platform-agent signals and recommend cross-studio allocation priorities. This never mutates budgets, posts, invoices, or campaigns.',
        inputSchema: z.object({
          prompt: z.string().min(1).describe('The traffic-control question to answer.'),
          clientId: z.string().optional().describe('Optional client id for scoped platform signals.'),
        }),
        execute: async ({ prompt, clientId }) => {
          const binding = this.requireActiveBinding()
          return callTrafficControllerAppBridge(this.env, {
            prompt,
            context: {
              clientId: this.scopedClientId(clientId),
            },
          }, binding)
        },
      }),
    }
  }
}

function noStoreJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('cache-control', 'no-store')
  return json(data, { ...init, headers })
}

function turnNamespace(env: Env, agent: PlatformAgentKey): unknown | null {
  switch (agent) {
    case 'spend-controller':
      return env.SpendControllerAgent || null
    case 'publishing-planner':
      return env.PublishingPlannerAgent || null
    case 'financial-watch':
      return env.FinancialWatchAgent || null
    case 'traffic-controller':
      return env.TrafficControllerAgent || null
  }
}

function parseTurnPath(pathname: string): { agent: PlatformAgentKey, instanceId: string } | null {
  const match = pathname.match(/^\/v1\/turns\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  try {
    const agent = decodeURIComponent(match[1]!)
    const instanceId = decodeURIComponent(match[2]!)
    if (!PLATFORM_AGENT_KEYS.includes(agent as PlatformAgentKey) || !/^pa_[A-Za-z0-9_-]{32}$/.test(instanceId)) {
      return null
    }
    return { agent: agent as PlatformAgentKey, instanceId }
  } catch {
    return null
  }
}

async function handleGovernedTurn(
  request: Request,
  env: Env,
  route: { agent: PlatformAgentKey, instanceId: string },
): Promise<Response> {
  if (request.method !== 'POST') {
    return noStoreJson({ ok: false, error: 'Method not allowed' }, {
      status: 405,
      headers: { allow: 'POST' },
    })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return noStoreJson({ ok: false, error: 'Content-Type must be application/json' }, { status: 415 })
  }
  const declaredLength = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(declaredLength) && declaredLength > PLATFORM_AGENT_MAX_REQUEST_BODY_LENGTH) {
    return noStoreJson({ ok: false, error: 'Request body is too large' }, { status: 413 })
  }
  const rawBody = await request.text()
  if (rawBody.length > PLATFORM_AGENT_MAX_REQUEST_BODY_LENGTH) {
    return noStoreJson({ ok: false, error: 'Request body is too large' }, { status: 413 })
  }
  let body: { prompt?: unknown }
  try {
    body = JSON.parse(rawBody) as { prompt?: unknown }
  } catch {
    return noStoreJson({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt || prompt.length > PLATFORM_AGENT_MAX_PROMPT_LENGTH) {
    return noStoreJson({ ok: false, error: `prompt must be between 1 and ${PLATFORM_AGENT_MAX_PROMPT_LENGTH} characters` }, { status: 400 })
  }

  const authorization = request.headers.get('authorization')
  const scopeAssertion = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
  const secret = env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET?.trim()
  const claims = scopeAssertion && secret
    ? await verifyPlatformAgentScopeAssertion({
        token: scopeAssertion,
        secret,
        expectedAgent: route.agent,
        expectedInstanceId: route.instanceId,
      })
    : null
  if (!claims) return noStoreJson({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const namespace = turnNamespace(env, route.agent)
  if (!namespace) return noStoreJson({ ok: false, error: 'Agent runtime unavailable' }, { status: 503 })
  try {
    const resolveAgent = getAgentByName as unknown as (
      binding: unknown,
      instanceId: string,
    ) => Promise<{
      runGovernedTurn: (input: GovernedTurnInput) => Promise<GovernedTurnResult>
    }>
    const stub = await resolveAgent(namespace, route.instanceId)
    const result = await stub.runGovernedTurn({ prompt, scopeAssertion })
    return noStoreJson(result)
  } catch {
    return noStoreJson({ ok: false, error: 'Agent turn failed' }, { status: 502 })
  }
}

export async function handlePlatformAgentsFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({
      ok: true,
      worker: 'platform-agents',
      runtime: 'cloudflare-think',
      agents: [
        {
          className: 'SpendControllerAgent',
          transport: 'private',
          mode: 'read-only-and-propose-via-app',
        },
        {
          className: 'PublishingPlannerAgent',
          transport: 'private',
          mode: 'read-only-and-draft-only',
        },
        {
          className: 'FinancialWatchAgent',
          transport: 'private',
          mode: 'read-only',
        },
        {
          className: 'TrafficControllerAgent',
          transport: 'private',
          mode: 'read-only',
        },
      ],
      bridges: [
        {
          path: '/tools/spend-controller/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only',
        },
        {
          path: '/tools/publishing-planner/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only_or_draft_only',
        },
        {
          path: '/tools/financial-watch/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only',
        },
        {
          path: '/tools/traffic-controller/ask',
          auth: 'INTERNAL_API_KEY',
          mode: 'read_only',
        },
      ],
    })
  }

  const turnRoute = parseTurnPath(url.pathname)
  if (turnRoute) {
    if (env.THINK_TURNS_ENABLED !== 'true') return new Response('Not found', { status: 404 })
    return handleGovernedTurn(request, env, turnRoute)
  }

  if (request.method === 'POST' && url.pathname === '/tools/spend-controller/ask') {
    return handleSpendControllerBridge(request, env)
  }

  if (request.method === 'POST' && url.pathname === '/tools/publishing-planner/ask') {
    return handlePublishingPlannerBridge(request, env)
  }

  if (request.method === 'POST' && url.pathname === '/tools/financial-watch/ask') {
    return handleFinancialWatchBridge(request, env)
  }

  if (request.method === 'POST' && url.pathname === '/tools/traffic-controller/ask') {
    return handleTrafficControllerBridge(request, env)
  }

  return new Response('Not found', { status: 404 })
}

export default {
  fetch: handlePlatformAgentsFetch,
} satisfies ExportedHandler<Env>
