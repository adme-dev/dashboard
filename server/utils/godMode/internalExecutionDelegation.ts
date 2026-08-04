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

export const GOD_MODE_INTERNAL_EXECUTION_AUDIENCE = 'agency-dashboard-god-mode-internal-execution' as const
export const GOD_MODE_INTERNAL_EXECUTION_HEADER = 'x-god-mode-internal-execution' as const
export const GOD_MODE_INTERNAL_EXECUTION_TTL_SEC = 30
export const GOD_MODE_INTERNAL_EXECUTION_MAX_TTL_SEC = 60

type DelegatedMethod = 'POST' | 'PUT' | 'PATCH'

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

interface InternalExecutionRequest {
  method: DelegatedMethod
  path: string
  body: unknown
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digestPattern = /^[0-9a-f]{64}$/
const idempotencyPattern = /^mcp:[0-9a-f]{64}$/
const boundedId = '[A-Za-z0-9_-]{1,128}'
const delegatorContextKey = Symbol('godModeInternalExecutionDelegator')

const allowedTargets: Array<{ method: DelegatedMethod, path: RegExp }> = [
  { method: 'POST', path: /^\/api\/agency\/tasks$/ },
  { method: 'PATCH', path: new RegExp(`^/api/agency/tasks/${boundedId}/(?:assignee|status)$`) },
  { method: 'POST', path: new RegExp(`^/api/agency/briefs/${boundedId}/convert$`) },
  { method: 'POST', path: /^\/api\/agency\/social\/publishing\/posts$/ },
  { method: 'POST', path: new RegExp(`^/api/agency/social/spend/${boundedId}/actions/plan$`) },
  { method: 'POST', path: /^\/api\/agency\/budget-alerts$/ },
  { method: 'POST', path: new RegExp(`^/api/agency/expenses/${boundedId}/approve$`) },
  { method: 'PUT', path: new RegExp(`^/api/agency/expenses/${boundedId}$`) },
  { method: 'POST', path: /^\/api\/agency\/eom\/generate$/ },
  { method: 'POST', path: /^\/api\/crm\/opportunities$/ },
  { method: 'POST', path: /^\/api\/crm\/activities$/ },
  { method: 'POST', path: new RegExp(`^/api/crm/opportunities/${boundedId}/create-quote$`) },
  { method: 'PUT', path: new RegExp(`^/api/agency/proofs/${boundedId}/status$`) }
]

export function isAllowedGodModeInternalExecutionTarget(method: string, path: string): boolean {
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
    || !['POST', 'PUT', 'PATCH'].includes(String(claim.method))
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
    || bodyDigest !== claim.bodyDigest
  ) deny(403, 'Internal execution delegation does not match this request')

  const resolveAuthority = dependencies.resolveAuthority ?? resolveGodModeAuthority
  const authority: GodModeAuthority = await resolveAuthority(event, claim.actorUserId)
  if (!isActiveGodModeAuthority(authority, claim.actorUserId)) {
    deny(403, 'Internal execution owner authority is no longer active')
  }

  let consumed = false
  try {
    consumed = await (dependencies.consumeNonce ?? defaultConsumeNonce)(claim.jti, claim.actorUserId, claim.exp)
  } catch {
    deny(503, 'Internal execution replay protection unavailable')
  }
  if (!consumed) deny(409, 'Internal execution delegation already consumed')
  return claim
}
