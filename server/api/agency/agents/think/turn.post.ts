import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'
import {
  beginPlatformAgentThinkTurn,
  completePlatformAgentThinkTurn,
  denyPlatformAgentThinkTurn,
  failPlatformAgentThinkTurn,
  type PlatformAgentThinkTelemetry
} from '~~/server/utils/ai/platformAgentThinkTelemetry'
import {
  consumePlatformAgentTurnBudget,
  platformAgentTurnBudgetLimitsFromEnv
} from '~~/server/utils/ai/platformAgentTurnBudget'
import type { PermissionGroup } from '~~/server/utils/permissions'
import {
  PLATFORM_AGENT_KEYS,
  type PlatformAgentKey,
  issuePlatformAgentScopeAssertion
} from '~~/shared/utils/platformAgentScopeAssertion'

interface ThinkTurnBody {
  agent?: unknown
  prompt?: unknown
  context?: unknown
}

interface AgentAuthorityPolicy {
  permissionGroups: readonly PermissionGroup[]
  tenant: 'required' | 'none'
  clientAccess?: 'assigned_or_management' | 'all'
  clientSelection: 'required' | 'all_allowed'
}

const MAX_PROMPT_LENGTH = 8_000
const MAX_RESPONSE_LENGTH = 65_536

const AUTHORITY_POLICIES: Record<PlatformAgentKey, AgentAuthorityPolicy> = {
  'spend-controller': {
    permissionGroups: ['MEDIA_BUYING'],
    tenant: 'none',
    clientSelection: 'all_allowed'
  },
  'publishing-planner': {
    permissionGroups: ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'],
    tenant: 'none',
    clientSelection: 'required'
  },
  'financial-watch': {
    permissionGroups: ['FINANCE'],
    tenant: 'required',
    clientAccess: 'all',
    clientSelection: 'all_allowed'
  },
  'traffic-controller': {
    permissionGroups: ['ADMIN'],
    tenant: 'none',
    clientSelection: 'all_allowed'
  }
}

function workerOrigin(): string | null {
  const configured = process.env.PLATFORM_AGENT_WORKER_URL?.trim()
  if (!configured) return null
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function parseAgent(value: unknown): PlatformAgentKey | null {
  return typeof value === 'string' && PLATFORM_AGENT_KEYS.includes(value as PlatformAgentKey)
    ? value as PlatformAgentKey
    : null
}

function safeTelemetryInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 100_000_000
    ? value
    : null
}

function safeWorkerTelemetry(value: unknown): PlatformAgentThinkTelemetry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const telemetry = value as Record<string, unknown>
  const integerFields = [
    'stepCount',
    'toolCallCount',
    'toolFailureCount',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'cachedInputTokens',
    'reasoningTokens',
    'durationMs'
  ] as const
  const integers = Object.fromEntries(integerFields.map(field => [field, safeTelemetryInteger(telemetry[field])]))
  if (Object.values(integers).some(value => value == null)) return null
  if (telemetry.provider !== 'cloudflare-workers-ai') return null
  if (typeof telemetry.modelId !== 'string' || !/^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(telemetry.modelId)) return null
  if (telemetry.finishReason != null && (typeof telemetry.finishReason !== 'string' || telemetry.finishReason.length > 64)) return null
  if (telemetry.failureStage != null && !['parse', 'persist', 'turn', 'stream', 'recovery', 'transcript'].includes(String(telemetry.failureStage))) return null
  if (typeof telemetry.recoveryExhausted !== 'boolean') return null
  return {
    status: 'completed',
    provider: telemetry.provider,
    modelId: telemetry.modelId,
    stepCount: integers.stepCount!,
    toolCallCount: integers.toolCallCount!,
    toolFailureCount: integers.toolFailureCount!,
    promptTokens: integers.promptTokens!,
    completionTokens: integers.completionTokens!,
    totalTokens: integers.totalTokens!,
    cachedInputTokens: integers.cachedInputTokens!,
    reasoningTokens: integers.reasoningTokens!,
    finishReason: telemetry.finishReason == null ? null : String(telemetry.finishReason),
    failureStage: telemetry.failureStage == null ? null : String(telemetry.failureStage),
    recoveryExhausted: telemetry.recoveryExhausted,
    durationMs: integers.durationMs!
  }
}

function safeWorkerResult(raw: string): {
  publicResult: { requestId?: string, status: PlatformAgentThinkTelemetry['status'], text?: string }
  telemetry: PlatformAgentThinkTelemetry
} | null {
  if (!raw || raw.length > MAX_RESPONSE_LENGTH) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (typeof parsed.status !== 'string' || !['completed', 'error', 'aborted', 'skipped'].includes(parsed.status)) return null
    if (parsed.requestId != null && (typeof parsed.requestId !== 'string' || parsed.requestId.length > 255)) return null
    if (parsed.text != null && (typeof parsed.text !== 'string' || parsed.text.length > 32_768)) return null
    const telemetry = safeWorkerTelemetry(parsed.telemetry)
    if (!telemetry) return null
    const status = parsed.status as PlatformAgentThinkTelemetry['status']
    return {
      publicResult: {
        ...(typeof parsed.requestId === 'string' ? { requestId: parsed.requestId } : {}),
        status,
        ...(typeof parsed.text === 'string' ? { text: parsed.text } : {})
      },
      telemetry: {
        ...telemetry,
        ...(typeof parsed.requestId === 'string' ? { requestId: parsed.requestId } : {}),
        status
      }
    }
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  if (process.env.PLATFORM_AGENT_THINK_TURNS_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Platform agent Think turns are not enabled' })
  }
  setHeader(event, 'cache-control', 'no-store')

  const body = await readBody<ThinkTurnBody>(event)
  const agent = parseAgent(body?.agent)
  if (!agent) throw createError({ statusCode: 400, statusMessage: 'Supported agent required' })
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `prompt must be between 1 and ${MAX_PROMPT_LENGTH} characters` })
  }

  const secret = process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET?.trim()
  const origin = workerOrigin()
  if (!secret || secret.length < 32 || !origin) {
    throw createError({ statusCode: 503, statusMessage: 'Platform agent Think transport is not configured' })
  }

  const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : {}
  const policy = AUTHORITY_POLICIES[agent]
  const authority = await resolveUserPlatformAgentAuthority(event, {
    permissionGroups: [...policy.permissionGroups],
    tenant: policy.tenant,
    ...(policy.clientAccess ? { clientAccess: policy.clientAccess } : {})
  })
  const scope = resolvePlatformAgentScope(authority, {
    requestedTenantId: typeof context.tenantId === 'string' ? context.tenantId : null,
    requestedClientId: typeof context.clientId === 'string' ? context.clientId : null,
    clientSelection: policy.clientSelection
  })
  const issued = await issuePlatformAgentScopeAssertion({ agent, scope, secret })
  const run = await beginPlatformAgentThinkTurn({
    agent,
    correlationId: scope.correlationId,
    userId: scope.actor.id,
    clientId: scope.client.kind === 'single' ? scope.client.clientId : null,
    tenantId: scope.tenantId
  })
  const budget = await consumePlatformAgentTurnBudget({
    userId: scope.actor.id,
    limits: platformAgentTurnBudgetLimitsFromEnv()
  })
  if (!budget.allowed) {
    await Promise.allSettled([denyPlatformAgentThinkTurn(run, budget)])
    setHeader(event, 'retry-after', String(budget.retryAfterSeconds))
    if (budget.code === 'budget_unavailable') {
      throw createError({ statusCode: 503, statusMessage: 'Platform agent budget is unavailable' })
    }
    throw createError({ statusCode: 429, statusMessage: 'Platform agent daily turn limit reached' })
  }

  let response: Response
  try {
    response = await fetch(`${origin}/v1/turns/${agent}/${encodeURIComponent(issued.claims.instanceId)}`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${issued.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(75_000)
    })
  } catch {
    await failPlatformAgentThinkTurn(run, { code: 'worker_unreachable' })
    throw createError({ statusCode: 502, statusMessage: 'Platform agent turn failed' })
  }
  if (!response.ok) {
    await failPlatformAgentThinkTurn(run, { code: 'worker_http_error' })
    throw createError({ statusCode: 502, statusMessage: 'Platform agent turn failed' })
  }

  const parsed = safeWorkerResult(await response.text())
  if (!parsed) {
    await failPlatformAgentThinkTurn(run, { code: 'worker_invalid_response' })
    throw createError({ statusCode: 502, statusMessage: 'Platform agent response was invalid' })
  }
  if (parsed.publicResult.status !== 'completed') {
    await failPlatformAgentThinkTurn(run, {
      code: parsed.telemetry.recoveryExhausted
        ? 'context_overflow_recovery_exhausted'
        : `think_turn_${parsed.publicResult.status}`,
      telemetry: parsed.telemetry
    })
    throw createError({ statusCode: 502, statusMessage: 'Platform agent turn failed' })
  }
  await completePlatformAgentThinkTurn(run, parsed.telemetry)
  return parsed.publicResult
})
