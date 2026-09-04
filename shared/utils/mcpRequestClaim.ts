const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const MCP_REQUEST_AUDIENCE = 'agency-dashboard-internal-mcp' as const
export const MCP_REQUEST_CLAIM_TTL_SEC = 30
export const MCP_REQUEST_CLAIM_MAX_TTL_SEC = 60

export type McpRequestPath = '/api/internal/mcp/tools' | '/api/internal/mcp/call'
export type McpScope = 'mcp:read' | 'mcp:write'

export interface McpRequestClaim {
  uid: string
  scope: string[]
  godMode: boolean
  jti: string
  exp: number
  audience: typeof MCP_REQUEST_AUDIENCE
  method: 'POST'
  path: McpRequestPath
  toolName?: string
  bodyDigest: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha256Pattern = /^[0-9a-f]{64}$/
const allowedScopes = new Set<McpScope>(['mcp:read', 'mcp:write'])
const allowedPaths = new Set<McpRequestPath>(['/api/internal/mcp/tools', '/api/internal/mcp/call'])

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(encoded: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(`${base64}${padding}`)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function canonicalValue(value: unknown, inArray = false): string | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return JSON.stringify(value)
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? 'null' : undefined
  }
  if (typeof value === 'bigint') throw new TypeError('BigInt is not valid JSON')
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalValue(item, true) ?? 'null').join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
      .sort()
      .flatMap((key) => {
        const encoded = canonicalValue(record[key])
        return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`]
      })
    return `{${entries.join(',')}}`
  }
  return undefined
}

/** RFC-JSON-compatible deterministic encoding shared by Nitro and Workers. */
export function canonicalMcpJson(value: unknown): string {
  const encoded = canonicalValue(value)
  if (encoded === undefined) throw new TypeError('Value is not valid JSON')
  return encoded
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function digestMcpRequestBody(body: unknown): Promise<string> {
  return await sha256Hex(canonicalMcpJson(body))
}

function normalizeScopes(value: unknown): McpScope[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > allowedScopes.size) return null
  if (!value.every(scope => typeof scope === 'string' && allowedScopes.has(scope as McpScope))) return null
  if (new Set(value).size !== value.length || !value.includes('mcp:read')) return null
  return (['mcp:read', 'mcp:write'] as const).filter(scope => value.includes(scope))
}

function parseClaim(value: unknown): McpRequestClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const claim = value as Record<string, unknown>
  const keys = Object.keys(claim)
  const permittedKeys = new Set([
    'uid', 'scope', 'godMode', 'jti', 'exp', 'audience', 'method', 'path', 'toolName', 'bodyDigest'
  ])
  if (keys.some(key => !permittedKeys.has(key))) return null
  const scope = normalizeScopes(claim.scope)
  if (
    typeof claim.uid !== 'string'
    || claim.uid.length < 1
    || claim.uid.length > 128
    || !scope
    || typeof claim.godMode !== 'boolean'
    || typeof claim.jti !== 'string'
    || !uuidPattern.test(claim.jti)
    || !Number.isInteger(claim.exp)
    || claim.audience !== MCP_REQUEST_AUDIENCE
    || claim.method !== 'POST'
    || typeof claim.path !== 'string'
    || !allowedPaths.has(claim.path as McpRequestPath)
    || typeof claim.bodyDigest !== 'string'
    || !sha256Pattern.test(claim.bodyDigest)
  ) return null

  const path = claim.path as McpRequestPath
  if (path === '/api/internal/mcp/call') {
    if (typeof claim.toolName !== 'string' || claim.toolName.length < 1 || claim.toolName.length > 160) return null
  } else if (claim.toolName !== undefined) {
    return null
  }

  return {
    uid: claim.uid,
    scope,
    godMode: claim.godMode,
    jti: claim.jti,
    exp: claim.exp as number,
    audience: MCP_REQUEST_AUDIENCE,
    method: 'POST',
    path,
    ...(path === '/api/internal/mcp/call' ? { toolName: claim.toolName as string } : {}),
    bodyDigest: claim.bodyDigest
  }
}

async function importHmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage
  )
}

export async function signMcpRequestClaim(
  input: Omit<McpRequestClaim, 'jti' | 'exp'>,
  secret: string,
  options: { now?: number, ttlSec?: number, jti?: string } = {}
): Promise<string> {
  if (!secret) throw new Error('MCP request signing secret is required')
  const ttlSec = options.ttlSec ?? MCP_REQUEST_CLAIM_TTL_SEC
  if (!Number.isInteger(ttlSec) || ttlSec < 1 || ttlSec > MCP_REQUEST_CLAIM_MAX_TTL_SEC) {
    throw new RangeError(`MCP request claim TTL must be between 1 and ${MCP_REQUEST_CLAIM_MAX_TTL_SEC} seconds`)
  }
  const candidate = parseClaim({
    ...input,
    scope: normalizeScopes(input.scope),
    jti: options.jti ?? crypto.randomUUID(),
    exp: Math.floor((options.now ?? Date.now()) / 1000) + ttlSec
  })
  if (!candidate) throw new TypeError('Invalid MCP request claim')

  const body = bytesToBase64Url(textEncoder.encode(canonicalMcpJson(candidate)))
  const key = await importHmacKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body))
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifyMcpRequestClaim(
  encoded: string,
  secret: string,
  options: { now?: number } = {}
): Promise<McpRequestClaim | null> {
  try {
    if (!encoded || !secret) return null
    const parts = encoded.split('.')
    if (parts.length !== 2) return null
    const body = parts[0]!
    const encodedSignature = parts[1]!
    const bodyBytes = base64UrlToBytes(body)
    const signature = base64UrlToBytes(encodedSignature)
    if (!bodyBytes || !signature) return null
    const key = await importHmacKey(secret, ['verify'])
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, textEncoder.encode(body))
    if (!validSignature) return null
    const claim = parseClaim(JSON.parse(textDecoder.decode(bodyBytes)))
    if (!claim) return null

    const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
    if (claim.exp <= nowSec || claim.exp - nowSec > MCP_REQUEST_CLAIM_MAX_TTL_SEC) return null
    return claim
  } catch {
    return null
  }
}

/**
 * Stable operation identity: OAuth grant + SDK JSON-RPC request ID + exact operation. Never uses JTI.
 * JSON-RPC IDs are only strings or finite numbers; accepting objects/non-finite values would collapse
 * distinct protocol requests during canonical JSON encoding.
 */
export async function deriveMcpLogicalIdempotencyKey(
  oauthSessionId: string,
  protocolRequestId: string | number,
  toolName: string,
  operationBodyDigest: string
): Promise<string> {
  const validRequestId = (typeof protocolRequestId === 'string' && protocolRequestId.length > 0)
    || (typeof protocolRequestId === 'number' && Number.isFinite(protocolRequestId))
  if (
    !oauthSessionId
    || !validRequestId
    || !toolName
    || !sha256Pattern.test(operationBodyDigest)
  ) {
    throw new TypeError('OAuth session, valid MCP protocol request ID, tool, and operation digest are required')
  }
  return `mcp:${await sha256Hex(canonicalMcpJson({
    oauthSessionId,
    operationBodyDigest,
    protocolRequestId,
    toolName
  }))}`
}
