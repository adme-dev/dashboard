import { requirePlatformAgentServiceAuth } from '~~/server/utils/ai/platformAgentServiceAuth'
import {
  beginPlatformAgentThinkTurn,
  failPlatformAgentThinkTurn,
  type PlatformAgentThinkTelemetry
} from '~~/server/utils/ai/platformAgentThinkTelemetry'
import {
  PLATFORM_AGENT_KEYS,
  type PlatformAgentKey,
  verifyPlatformAgentScopeAssertion
} from '~~/shared/utils/platformAgentScopeAssertion'

interface RecoveryExhaustedBody {
  agent?: unknown
  instanceId?: unknown
  scopeAssertion?: unknown
  requestId?: unknown
  recoveryRootRequestId?: unknown
  modelId?: unknown
}

const DEFAULT_THINK_MODEL = '@cf/moonshotai/kimi-k2.7-code'
const REQUIRED_PERMISSION: Record<PlatformAgentKey, readonly string[]> = {
  'spend-controller': ['MEDIA_BUYING'],
  'publishing-planner': ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'],
  'financial-watch': ['FINANCE'],
  'traffic-controller': ['ADMIN']
}

function parseAgent(value: unknown): PlatformAgentKey | null {
  return typeof value === 'string' && PLATFORM_AGENT_KEYS.includes(value as PlatformAgentKey)
    ? value as PlatformAgentKey
    : null
}

function boundedIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : null
}

function safeModelId(value: unknown): string {
  return typeof value === 'string' && /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(value)
    ? value
    : DEFAULT_THINK_MODEL
}

async function recoveryIdempotencyKey(assertionId: string, recoveryRootRequestId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`xeroflow:think-recovery:v1:${assertionId}:${recoveryRootRequestId}`)
  )
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `think_recovery_${hex}`
}

export default defineEventHandler(async (event) => {
  await requirePlatformAgentServiceAuth(event)
  setHeader(event, 'cache-control', 'no-store')

  const body = await readBody<RecoveryExhaustedBody>(event)
  const agent = parseAgent(body?.agent)
  const instanceId = typeof body?.instanceId === 'string' && /^pa_[A-Za-z0-9_-]{32}$/.test(body.instanceId)
    ? body.instanceId
    : null
  const scopeAssertion = typeof body?.scopeAssertion === 'string' ? body.scopeAssertion : ''
  const requestId = boundedIdentifier(body?.requestId)
  const recoveryRootRequestId = boundedIdentifier(body?.recoveryRootRequestId)
  if (!agent || !instanceId || !scopeAssertion || !requestId || !recoveryRootRequestId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recovery event' })
  }

  const secret = process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Platform agent recovery telemetry is not configured' })
  }
  const claims = await verifyPlatformAgentScopeAssertion({
    token: scopeAssertion,
    secret,
    expectedAgent: agent,
    expectedInstanceId: instanceId
  })
  if (!claims || !REQUIRED_PERMISSION[agent].some(permission => claims.permissions.includes(permission))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const run = await beginPlatformAgentThinkTurn({
    agent,
    correlationId: claims.correlationId,
    userId: claims.subject,
    clientId: claims.clientScopeKind === 'single' ? claims.clientIds[0] ?? null : null,
    tenantId: claims.tenantId,
    idempotencyKey: await recoveryIdempotencyKey(claims.jti, recoveryRootRequestId)
  })
  if (run.deduplicated) {
    setResponseStatus(event, 202)
    return { accepted: true, deduplicated: true }
  }
  const telemetry: PlatformAgentThinkTelemetry = {
    requestId,
    status: 'error',
    provider: 'cloudflare-workers-ai',
    modelId: safeModelId(body.modelId),
    stepCount: 0,
    toolCallCount: 0,
    toolFailureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    finishReason: null,
    failureStage: 'recovery',
    recoveryExhausted: true,
    durationMs: 0
  }
  await failPlatformAgentThinkTurn(run, {
    code: 'chat_recovery_exhausted',
    telemetry
  })

  setResponseStatus(event, 202)
  return { accepted: true }
})
