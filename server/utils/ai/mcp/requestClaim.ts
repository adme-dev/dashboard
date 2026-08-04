import type { H3Event } from 'h3'
import { createError, getHeader, getMethod, getRequestURL, readBody } from 'h3'

import {
  MCP_REQUEST_AUDIENCE,
  digestMcpRequestBody,
  verifyMcpRequestClaim,
  type McpRequestClaim
} from '~~/shared/utils/mcpRequestClaim'
import { queryOneFresh } from '~~/server/utils/db'
import {
  isActiveGodModeAuthority,
  isGodModeAuthorityForActor,
  resolveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'

type ConsumeNonce = (claim: McpRequestClaim) => Promise<boolean>

export interface ConsumeMcpRequestClaimDependencies {
  signingSecret?: string
  now?: number
  body?: unknown
  method?: string
  path?: string
  scopeHeader?: string
  resolveAuthority?: typeof resolveGodModeAuthority
  consumeNonce?: ConsumeNonce
}

const authorityContextKey = Symbol('mcpRequestGodModeAuthority')

function requestSigningSecret(event: H3Event, configured?: string): string {
  if (configured !== undefined) return configured
  const binding = (event.context as any).cloudflare?.env?.MCP_REQUEST_SIGNING_SECRET
  return typeof binding === 'string' ? binding : (process.env.MCP_REQUEST_SIGNING_SECRET ?? '')
}

function exactScopeHeaderMatches(header: string, scope: string[]): boolean {
  const headerScopes = header.trim() ? header.trim().split(/\s+/) : []
  return headerScopes.length === scope.length && headerScopes.every((value, index) => value === scope[index])
}

function expectedPath(event: H3Event, configured?: string): string {
  if (configured !== undefined) return configured
  return getRequestURL(event).pathname
}

function expectedMethod(event: H3Event, configured?: string): string {
  if (configured !== undefined) return configured
  return getMethod(event)
}

async function defaultConsumeNonce(claim: McpRequestClaim): Promise<boolean> {
  const inserted = await queryOneFresh<{ jti: string }>(
    `INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at)
     VALUES ($1, $2, to_timestamp($3))
     ON CONFLICT (jti) DO NOTHING
     RETURNING jti`,
    [claim.jti, claim.uid, claim.exp]
  )
  return inserted?.jti === claim.jti
}

function deny(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export function getMcpRequestGodModeAuthority(
  event: H3Event,
  expectedUserId: string
): GodModeAuthority | null {
  const authority = (event.context as Record<PropertyKey, unknown>)[authorityContextKey]
  return isGodModeAuthorityForActor(authority, expectedUserId) ? authority : null
}

/**
 * Validates every exact-request binding and current authority before atomically consuming the JTI.
 * A successful return means projection/execution may begin; failures consume no nonce.
 */
export async function consumeMcpRequestClaim(
  event: H3Event,
  encoded: string,
  expectedUserId: string,
  dependencies: ConsumeMcpRequestClaimDependencies = {}
): Promise<McpRequestClaim> {
  const secret = requestSigningSecret(event, dependencies.signingSecret)
  if (!secret) deny(503, 'MCP request signing is not configured')

  const claim = await verifyMcpRequestClaim(encoded, secret, { now: dependencies.now })
  if (!claim) deny(401, 'Invalid or expired MCP request assertion')

  const method = expectedMethod(event, dependencies.method)
  const path = expectedPath(event, dependencies.path)
  if (
    claim.audience !== MCP_REQUEST_AUDIENCE
    || claim.method !== method
    || claim.path !== path
    || claim.uid !== expectedUserId
  ) deny(403, 'MCP request assertion does not match this request')

  const body = Object.prototype.hasOwnProperty.call(dependencies, 'body')
    ? dependencies.body
    : await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    deny(403, 'MCP request assertion does not match this request')
  }

  const toolName = (body as Record<string, unknown>).tool
  if (
    (claim.path === '/api/internal/mcp/call' && (typeof toolName !== 'string' || claim.toolName !== toolName))
    || (claim.path === '/api/internal/mcp/tools' && claim.toolName !== undefined)
    || claim.bodyDigest !== await digestMcpRequestBody(body)
  ) deny(403, 'MCP request assertion does not match this request')

  const hasConfiguredScopeHeader = Object.prototype.hasOwnProperty.call(dependencies, 'scopeHeader')
  const scopeHeader = hasConfiguredScopeHeader
    ? dependencies.scopeHeader
    : getHeader(event, 'x-mcp-scope')
  if (scopeHeader !== undefined && !exactScopeHeaderMatches(scopeHeader, claim.scope)) {
    deny(403, 'MCP scope assertion mismatch')
  }

  const resolveAuthority = dependencies.resolveAuthority ?? resolveGodModeAuthority
  const authority = await resolveAuthority(event, expectedUserId)
  if (claim.godMode && !isActiveGodModeAuthority(authority, expectedUserId)) {
    deny(403, 'MCP owner authority is no longer active')
  }

  let consumed = false
  try {
    consumed = await (dependencies.consumeNonce ?? defaultConsumeNonce)(claim)
  } catch {
    deny(503, 'MCP replay protection unavailable')
  }
  if (!consumed) deny(409, 'MCP request assertion already consumed')

  ;(event.context as Record<PropertyKey, unknown>)[authorityContextKey] = authority
  return claim
}
