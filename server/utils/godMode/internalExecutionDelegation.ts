import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader, getMethod, getRequestURL, readBody } from 'h3'

import {
  canonicalMcpJson,
  digestMcpRequestBody
} from '~~/shared/utils/mcpRequestClaim'
import { queryOneFresh } from '~~/server/utils/db'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'
import { getMcpRequestGodModeAuthority } from '~~/server/utils/ai/mcp/requestClaim'

export const GOD_MODE_INTERNAL_EXECUTION_AUDIENCE = 'agency-dashboard-god-mode-internal-execution' as const
export const GOD_MODE_INTERNAL_EXECUTION_HEADER = 'x-god-mode-internal-execution' as const
export const GOD_MODE_INTERNAL_EXECUTION_TTL_SEC = 30
export const GOD_MODE_INTERNAL_EXECUTION_MAX_TTL_SEC = 60

type DelegatedMethod = 'GET' | 'POST' | 'PUT' | 'PATCH'

export interface GodModeInternalExecutionClaim {
  actorUserId: string
  audience: typeof GOD_MODE_INTERNAL_EXECUTION_AUDIENCE
  channel: 'mcp'
  correlationId: string
  idempotencyKey: string
  routeOrTool: string
  method: DelegatedMethod
  path: string
  bodyDigest: string
  jti: string
  exp: number
}

export type GodModeInternalExecutionClaimInput = Omit<GodModeInternalExecutionClaim, 'audience' | 'jti' | 'exp'>

export interface ConsumeGodModeInternalExecutionDependencies {
  signingSecret?: string
  now?: number
  encoded?: string
  method?: string
  path?: string
  body?: unknown
  resolveAuthority?: typeof resolveGodModeAuthority
  consumeNonce?: (jti: string, actorUserId: string, exp: number) => Promise<boolean>
}

export interface InstallGodModeInternalExecutionDelegatorInput {
  actorUserId: string
  authority: GodModeAuthority
  correlationId: string
  idempotencyKey: string
  routeOrTool: string
}

export type TrustedTask5DelegatedExecution = Readonly<GodModeInternalExecutionClaim>

export interface TrustedTask5DelegatedExecutionDependencies {
  now?: number
  method?: string
  path?: string
  body?: unknown
}

interface InternalExecutionRequest {
  method: DelegatedMethod
  path: string
  body: unknown
}

export interface MintMcpGodModeInternalAiDelegationInput extends InternalExecutionRequest {
  actorUserId: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digestPattern = /^[0-9a-f]{64}$/
const idempotencyPattern = /^mcp:[0-9a-f]{64}$/
const boundedId = '[A-Za-z0-9_-]{1,128}'
const delegatorContextKey = Symbol('godModeInternalExecutionDelegator')
const trustedExecutions = new WeakSet<object>()
const trustedExecutionByEvent = new WeakMap<H3Event, TrustedTask5DelegatedExecution>()
const pendingConsumptionByEvent = new WeakMap<H3Event, {
  claim: GodModeInternalExecutionClaim
  promise: Promise<GodModeInternalExecutionClaim>
}>()

const allowedTargets: Array<{ method: DelegatedMethod, path: RegExp }> = [
  { method: 'POST', path: /^\/api\/agency\/tasks$/ },
  { method: 'PATCH', path: new RegExp(`^/api/agency/tasks/${boundedId}/(?:assignee|status)$`) },
  { method: 'POST', path: new RegExp(`^/api/agency/briefs/${boundedId}/convert$`) },
  { method: 'POST', path: /^\/api\/agency\/social\/publishing\/posts$/ },
  { method: 'POST', path: new RegExp(`^/api/agency/social/spend/${boundedId}/actions/plan$`) },
  // Budget ALLOCATION writes (media_spend.budget_allocated): the audited PATCH endpoints
  // the propose_set_campaign_budget / propose_bulk_set_campaign_budgets executors call.
  { method: 'PATCH', path: new RegExp(`^/api/agency/social/spend/${boundedId}$`) },
  { method: 'PATCH', path: /^\/api\/agency\/social\/spend\/bulk-budget$/ },
  { method: 'POST', path: /^\/api\/agency\/budget-alerts$/ },
  { method: 'POST', path: new RegExp(`^/api/agency/expenses/${boundedId}/approve$`) },
  { method: 'PUT', path: new RegExp(`^/api/agency/expenses/${boundedId}$`) },
  { method: 'POST', path: /^\/api\/agency\/eom\/generate$/ },
  { method: 'POST', path: /^\/api\/crm\/opportunities$/ },
  { method: 'POST', path: /^\/api\/crm\/activities$/ },
  { method: 'POST', path: new RegExp(`^/api/crm/opportunities/${boundedId}/create-quote$`) },
  { method: 'PUT', path: new RegExp(`^/api/agency/proofs/${boundedId}/status$`) }
]

type ReadTarget = {
  path: RegExp
  query?: Record<string, (value: string) => boolean>
  required?: readonly string[]
}

const uuidSegment = uuidPattern.source.replace(/^\^/, '').replace(/\$$/, '')
const boundedReadId = (value: string) => uuidPattern.test(value)
const boundedPositiveInteger = (maximum: number) => (value: string) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= maximum
}
const boundedNonNegativeInteger = (maximum: number) => (value: string) => {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= maximum
}
const oneOf = (...allowed: string[]) => (value: string) => allowed.includes(value)
const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const isoDateTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)

/** Registered read routes used by AI tools. Each entry owns its query surface; no prefix matching. */
const allowedReadTargets: ReadTarget[] = [
  { path: /^\/api\/email\/campaigns$/ },
  { path: new RegExp(`^/api/email/campaigns/${uuidSegment}/events$`, 'i') },
  { path: /^\/api\/agency\/social\/spend\/summary$/ },
  {
    path: /^\/api\/crm\/(?:pipeline|stages)$/,
    query: { client_id: boundedReadId },
    required: ['client_id']
  },
  { path: /^\/api\/agency\/capacity$/ },
  {
    path: /^\/api\/agency\/social\/inbox\/analytics\/overview$/,
    query: { clientId: boundedReadId, days: oneOf('7', '30', '90') },
    required: ['clientId', 'days']
  },
  {
    path: /^\/api\/agency\/social\/inbox\/conversations$/,
    query: { clientId: boundedReadId, status: oneOf('open'), limit: oneOf('25') },
    required: ['clientId', 'status', 'limit']
  },
  { path: /^\/api\/xero\/get-out\/(?:cash-position|forecast|pipeline-coverage)$/ },
  { path: /^\/api\/xero\/invoices$/ },
  { path: /^\/api\/agency\/budget-alerts\/health$/ },
  {
    path: /^\/api\/agency\/social\/reporting\/overview$/,
    query: { clientId: boundedReadId, from: isoDateTime, to: isoDateTime },
    required: ['clientId', 'from', 'to']
  },
  { path: new RegExp(`^/api/agency/social/news/profiles/${uuidSegment}$`, 'i') },
  { path: new RegExp(`^/api/agency/social/news/profiles/${uuidSegment}/context$`, 'i') },
  {
    path: /^\/api\/agency\/social\/news$/,
    query: {
      clientId: boundedReadId,
      status: oneOf('unread'),
      relevantOnly: oneOf('true'),
      limit: boundedPositiveInteger(8)
    },
    required: ['clientId', 'status', 'relevantOnly', 'limit']
  },
  {
    path: /^\/api\/agency\/social\/publishing\/accounts$/,
    query: { clientId: boundedReadId },
    required: ['clientId']
  },
  {
    path: /^\/api\/leads\/list$/,
    query: {
      client_id: boundedReadId,
      status: oneOf('new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected'),
      source: oneOf('meta', 'google', 'manual', 'webhook', 'csv'),
      from: isoDateTime,
      page_size: boundedPositiveInteger(50)
    },
    required: ['client_id', 'from', 'page_size']
  },
  {
    path: /^\/api\/agency\/analytics\/campaigns$/,
    query: {
      startDate: isoDate,
      endDate: isoDate,
      sortBy: oneOf('spend'),
      sortDir: oneOf('desc'),
      showInactive: oneOf('true'),
      limit: oneOf('200'),
      offset: boundedNonNegativeInteger(100_000),
      platform: oneOf('meta', 'google_ads,google')
    },
    required: ['startDate', 'endDate', 'sortBy', 'sortDir', 'showInactive', 'limit', 'offset']
  },
  {
    path: /^\/api\/agency\/social\/listening\/overview$/,
    query: { clientId: boundedReadId, days: oneOf('7', '30', '90') },
    required: ['clientId', 'days']
  },
  {
    path: /^\/api\/agency\/social\/listening\/mentions$/,
    query: { clientId: boundedReadId, sentiment: oneOf('negative'), limit: oneOf('5') },
    required: ['clientId', 'sentiment', 'limit']
  }
]

const exactDraftFollowupPath = '/api/crm/ai/draft-followup'

function isExactDraftFollowupBody(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const record = body as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return keys.length === 2
    && keys[0] === 'client_id'
    && keys[1] === 'opportunity_id'
    && typeof record.client_id === 'string'
    && uuidPattern.test(record.client_id)
    && typeof record.opportunity_id === 'string'
    && uuidPattern.test(record.opportunity_id)
}


function isEmptyObjectBody(body: unknown): boolean {
  return !!body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body as object).length === 0
}

export function isAllowedGodModeAiReadBridgeRequest(method: string, path: string, body: unknown): boolean {
  if (method === 'GET') return (body === null || body === undefined) && isAllowedReadTarget(path)
  if (method !== 'POST') return false
  if (path === exactDraftFollowupPath) return isExactDraftFollowupBody(body)
  if (spendSyncKickoffPath.test(path)) return isEmptyObjectBody(body)
  return false
}

function isAllowedReadTarget(path: string): boolean {
  if (
    path.length < 1
    || path.length > 512
    || !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('#')
    || /(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(path)
    || /%(?:2f|5c)/i.test(path)
  ) return false

  let url: URL
  try {
    url = new URL(path, 'https://internal.invalid')
  } catch {
    return false
  }
  if (`${url.pathname}${url.search}` !== path) return false

  return allowedReadTargets.some((target) => {
    if (!target.path.test(url.pathname)) return false
    const entries = [...url.searchParams.entries()]
    if (!target.query) return entries.length === 0
    const seen = new Set<string>()
    for (const [key, value] of entries) {
      const validator = target.query[key]
      if (!validator || seen.has(key) || !validator(value)) return false
      seen.add(key)
    }
    return (target.required ?? []).every(key => seen.has(key))
  })
}

/** Operational spend-sync kickoffs used by run_adspend_sync. Empty body only: the period is always "now". */
const spendSyncKickoffPath = /^\/api\/agency\/social\/(?:meta|google)\/sync-spend$/

export function isAllowedGodModeInternalExecutionTarget(method: string, path: string): boolean {
  if (method === 'GET') return isAllowedReadTarget(path)
  if (method === 'POST' && path === exactDraftFollowupPath) return true
  if (method === 'POST' && spendSyncKickoffPath.test(path)) return true
  return allowedTargets.some(target => target.method === method && target.path.test(path))
}

function parseClaim(value: unknown): GodModeInternalExecutionClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const claim = value as Record<string, unknown>
  const permitted = new Set([
    'actorUserId', 'audience', 'channel', 'correlationId', 'idempotencyKey', 'routeOrTool',
    'method', 'path', 'bodyDigest', 'jti', 'exp'
  ])
  if (Object.keys(claim).some(key => !permitted.has(key))) return null
  if (
    typeof claim.actorUserId !== 'string'
    || !uuidPattern.test(claim.actorUserId)
    || claim.audience !== GOD_MODE_INTERNAL_EXECUTION_AUDIENCE
    || claim.channel !== 'mcp'
    || typeof claim.correlationId !== 'string'
    || !uuidPattern.test(claim.correlationId)
    || typeof claim.idempotencyKey !== 'string'
    || !idempotencyPattern.test(claim.idempotencyKey)
    || typeof claim.routeOrTool !== 'string'
    || claim.routeOrTool.length < 1
    || claim.routeOrTool.length > 160
    || !['GET', 'POST', 'PUT', 'PATCH'].includes(String(claim.method))
    || typeof claim.path !== 'string'
    || claim.path.length > 512
    || !isAllowedGodModeInternalExecutionTarget(String(claim.method), claim.path)
    || typeof claim.bodyDigest !== 'string'
    || !digestPattern.test(claim.bodyDigest)
    || typeof claim.jti !== 'string'
    || !uuidPattern.test(claim.jti)
    || !Number.isInteger(claim.exp)
  ) return null

  return claim as unknown as GodModeInternalExecutionClaim
}

function claimsMatch(left: GodModeInternalExecutionClaim, right: GodModeInternalExecutionClaim): boolean {
  return canonicalMcpJson(left) === canonicalMcpJson(right)
}

function signature(encodedBody: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedBody).digest()
}

export async function signGodModeInternalExecutionClaim(
  input: GodModeInternalExecutionClaimInput,
  secret: string,
  options: { now?: number, ttlSec?: number, jti?: string } = {}
): Promise<string> {
  if (secret.length < 32) throw new Error('God mode internal execution secret is unavailable')
  const ttlSec = options.ttlSec ?? GOD_MODE_INTERNAL_EXECUTION_TTL_SEC
  if (!Number.isInteger(ttlSec) || ttlSec < 1 || ttlSec > GOD_MODE_INTERNAL_EXECUTION_MAX_TTL_SEC) {
    throw new RangeError('God mode internal execution claim TTL is invalid')
  }
  const claim = parseClaim({
    ...input,
    audience: GOD_MODE_INTERNAL_EXECUTION_AUDIENCE,
    jti: options.jti ?? randomUUID(),
    exp: Math.floor((options.now ?? Date.now()) / 1000) + ttlSec
  })
  if (!claim) throw new TypeError('Invalid God mode internal execution claim')
  const body = Buffer.from(canonicalMcpJson(claim), 'utf8').toString('base64url')
  return `${body}.${signature(body, secret).toString('base64url')}`
}

export async function verifyGodModeInternalExecutionClaim(
  encoded: string,
  secret: string,
  options: { now?: number } = {}
): Promise<GodModeInternalExecutionClaim | null> {
  try {
    if (!encoded || secret.length < 32) return null
    const parts = encoded.split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const body = parts[0]
    const actual = Buffer.from(parts[1], 'base64url')
    const expected = signature(body, secret)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const claim = parseClaim(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    if (!claim) return null
    const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
    if (claim.exp <= nowSec || claim.exp - nowSec > GOD_MODE_INTERNAL_EXECUTION_MAX_TTL_SEC) return null
    return claim
  } catch {
    return null
  }
}

function configuredSecret(event: H3Event, supplied?: string): string {
  if (supplied !== undefined) return supplied
  const binding = (event.context as any).cloudflare?.env?.GOD_MODE_INTERNAL_EXECUTION_SECRET
  return typeof binding === 'string'
    ? binding
    : (process.env.GOD_MODE_INTERNAL_EXECUTION_SECRET ?? '')
}

function requestHeader(event: H3Event, name: string): string | undefined {
  const eventHeaders = (event as unknown as { headers?: Headers | Record<string, string | undefined> }).headers
  if (eventHeaders instanceof Headers) return eventHeaders.get(name) ?? undefined
  const direct = eventHeaders?.[name] ?? eventHeaders?.[name.toLowerCase()]
  if (typeof direct === 'string') return direct
  if (event.node?.req) return getHeader(event, name)
  const autoImport = (globalThis as { getHeader?: (event: H3Event, name: string) => string | undefined }).getHeader
  return typeof autoImport === 'function' ? autoImport(event, name) : undefined
}

/**
 * Installs a request-local signer only after the trusted MCP coordinator has recovered the exact branded
 * authority. The symbol and closure are server-private and cannot be supplied through JSON or headers.
 */
export function installGodModeInternalExecutionDelegator(
  event: H3Event,
  input: InstallGodModeInternalExecutionDelegatorInput
): void {
  if (
    !isActiveGodModeAuthority(input.authority, input.actorUserId)
    || !uuidPattern.test(input.correlationId)
    || !idempotencyPattern.test(input.idempotencyKey)
    || !input.routeOrTool
    || input.routeOrTool.length > 160
  ) deny(403, 'Invalid internal execution delegation authority')

  const context = event.context as Record<PropertyKey, unknown>
  context[delegatorContextKey] = async (request: InternalExecutionRequest) => {
    return await signGodModeInternalExecutionClaim({
      actorUserId: input.actorUserId,
      channel: 'mcp',
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      routeOrTool: input.routeOrTool,
      method: request.method,
      path: request.path,
      bodyDigest: await digestMcpRequestBody(request.body)
    }, configuredSecret(event))
  }
}

/** Returns null for ordinary application execution; only the private coordinator-installed closure signs. */
export async function mintInstalledGodModeInternalExecutionDelegation(
  event: H3Event,
  request: InternalExecutionRequest
): Promise<string | null> {
  const signer = (event.context as Record<PropertyKey, unknown>)[delegatorContextKey]
  if (typeof signer !== 'function') return null
  return await (signer as (request: InternalExecutionRequest) => Promise<string>)(request)
}

/**
 * Mints a nested AI read delegation only from an already-consumed, privately branded MCP owner call.
 * The original signed call body supplies the exact actor/tool/logical identity; caller headers cannot
 * manufacture the WeakMap authority brand. GET reads and the one exact draft-only POST are allowlisted.
 */
export async function mintMcpGodModeInternalAiDelegation(
  event: H3Event,
  input: MintMcpGodModeInternalAiDelegationInput
): Promise<string> {
  if (!isAllowedGodModeAiReadBridgeRequest(input.method, input.path, input.body)) {
    deny(403, 'AI internal read target is not registered')
  }
  const sourceUrl = getRequestURL(event)
  if (getMethod(event) !== 'POST' || sourceUrl.pathname !== '/api/internal/mcp/call' || sourceUrl.search) {
    deny(403, 'Invalid MCP read delegation source')
  }
  const authority = getMcpRequestGodModeAuthority(event, input.actorUserId)
  if (!isActiveGodModeAuthority(authority, input.actorUserId)) {
    deny(403, 'MCP owner read authority is unavailable')
  }
  const sourceBody = await readBody(event).catch(() => null)
  if (!sourceBody || typeof sourceBody !== 'object' || Array.isArray(sourceBody)) {
    deny(403, 'Invalid MCP read delegation source')
  }
  const source = sourceBody as Record<string, unknown>
  if (
    source.userId !== input.actorUserId
    || typeof source.tool !== 'string'
    || source.tool.length < 1
    || source.tool.length > 160
    || typeof source.idempotencyKey !== 'string'
    || !idempotencyPattern.test(source.idempotencyKey)
  ) deny(403, 'Invalid MCP read delegation source')

  return await signGodModeInternalExecutionClaim({
    actorUserId: input.actorUserId,
    channel: 'mcp',
    correlationId: randomUUID(),
    idempotencyKey: source.idempotencyKey,
    routeOrTool: source.tool,
    method: input.method,
    path: input.path,
    bodyDigest: await digestMcpRequestBody(input.body)
  }, configuredSecret(event))
}

/**
 * Returns the runtime-branded Task 5 coordination marker only while it still matches this exact H3
 * request. The marker is keyed by the H3Event object itself and WeakSet branded, so structural clones,
 * shared context, JSON, and caller headers cannot manufacture or forward it.
 */
export async function getTrustedTask5DelegatedExecution(
  event: H3Event,
  dependencies: TrustedTask5DelegatedExecutionDependencies = {}
): Promise<TrustedTask5DelegatedExecution | null> {
  const marker = trustedExecutionByEvent.get(event)
  if (marker === undefined) return null
  if (!marker || typeof marker !== 'object' || !trustedExecutions.has(marker)) {
    deny(403, 'Invalid Task 5 delegated execution marker')
  }

  const claim = marker as TrustedTask5DelegatedExecution
  const actorUserId = (event.context as any).user?.id
  const method = (dependencies.method ?? getMethod(event)).toUpperCase()
  const path = dependencies.path ?? (() => {
    const url = getRequestURL(event)
    return `${url.pathname}${url.search}`
  })()
  const body = Object.prototype.hasOwnProperty.call(dependencies, 'body')
    ? dependencies.body
    : await readBody(event).catch(() => null)
  let bodyDigest: string
  try {
    bodyDigest = await digestMcpRequestBody(body)
  } catch {
    deny(403, 'Invalid Task 5 delegated execution marker')
  }
  const nowSec = Math.floor((dependencies.now ?? Date.now()) / 1000)

  if (
    typeof actorUserId !== 'string'
    || actorUserId !== claim.actorUserId
    || claim.channel !== 'mcp'
    || method !== claim.method
    || path !== claim.path
    || bodyDigest !== claim.bodyDigest
    || claim.exp <= nowSec
    || claim.exp - nowSec > GOD_MODE_INTERNAL_EXECUTION_MAX_TTL_SEC
    || !isAllowedGodModeInternalExecutionTarget(method, path)
  ) deny(403, 'Invalid Task 5 delegated execution marker')

  return claim
}

async function defaultConsumeNonce(jti: string, actorUserId: string, exp: number): Promise<boolean> {
  const inserted = await queryOneFresh<{ jti: string }>(
    `INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at)
     VALUES ($1, $2, to_timestamp($3))
     ON CONFLICT (jti) DO NOTHING
     RETURNING jti`,
    [jti, actorUserId, exp]
  )
  return inserted?.jti === jti
}

function deny(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export async function consumeGodModeInternalExecutionDelegation(
  event: H3Event,
  dependencies: ConsumeGodModeInternalExecutionDependencies = {}
): Promise<GodModeInternalExecutionClaim | null> {
  const encoded = dependencies.encoded ?? requestHeader(event, GOD_MODE_INTERNAL_EXECUTION_HEADER)
  if (!encoded) return null
  const claim = await verifyGodModeInternalExecutionClaim(
    encoded,
    configuredSecret(event, dependencies.signingSecret),
    { now: dependencies.now }
  )
  if (!claim) deny(401, 'Invalid or expired internal execution delegation')

  const method = (dependencies.method ?? getMethod(event)).toUpperCase()
  const path = dependencies.path ?? (() => {
    const url = getRequestURL(event)
    return `${url.pathname}${url.search}`
  })()
  const body = Object.prototype.hasOwnProperty.call(dependencies, 'body')
    ? dependencies.body
    : await readBody(event).catch(() => null)
  let bodyDigest: string
  try {
    bodyDigest = await digestMcpRequestBody(body)
  } catch {
    deny(403, 'Internal execution delegation does not match this request')
  }
  if (
    method !== claim.method
    || path !== claim.path
    || !isAllowedGodModeInternalExecutionTarget(method, path)
    || (method === 'POST' && path === exactDraftFollowupPath
      && !isAllowedGodModeAiReadBridgeRequest(method, path, body))
    || bodyDigest !== claim.bodyDigest
  ) deny(403, 'Internal execution delegation does not match this request')

  const resolveAuthority = dependencies.resolveAuthority ?? resolveGodModeAuthority
  const authority: GodModeAuthority = await resolveAuthority(event, claim.actorUserId)
  if (!isActiveGodModeAuthority(authority, claim.actorUserId)) {
    deny(403, 'Internal execution owner authority is no longer active')
  }

  const trusted = trustedExecutionByEvent.get(event)
  if (trusted) {
    if (!claimsMatch(trusted, claim)) deny(403, 'Internal execution delegation does not match this request')
    return trusted
  }

  const pending = pendingConsumptionByEvent.get(event)
  if (pending) {
    if (!claimsMatch(pending.claim, claim)) deny(403, 'Internal execution delegation does not match this request')
    return await pending.promise
  }

  const consumption = (async () => {
    let consumed = false
    try {
      consumed = await (dependencies.consumeNonce ?? defaultConsumeNonce)(claim.jti, claim.actorUserId, claim.exp)
    } catch {
      deny(503, 'Internal execution replay protection unavailable')
    }
    if (!consumed) deny(409, 'Internal execution delegation already consumed')
    const marker = Object.freeze({ ...claim })
    trustedExecutions.add(marker)
    trustedExecutionByEvent.set(event, marker)
    return claim
  })()
  pendingConsumptionByEvent.set(event, { claim, promise: consumption })
  try {
    return await consumption
  } finally {
    if (pendingConsumptionByEvent.get(event)?.promise === consumption) {
      pendingConsumptionByEvent.delete(event)
    }
  }
}
