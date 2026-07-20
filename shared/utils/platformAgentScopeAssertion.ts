export const PLATFORM_AGENT_KEYS = [
  'spend-controller',
  'publishing-planner',
  'financial-watch',
  'traffic-controller'
] as const

export type PlatformAgentKey = typeof PLATFORM_AGENT_KEYS[number]

export interface PlatformAgentAssertionScope {
  actor: Readonly<{
    type: 'user' | 'service'
    id: string
  }>
  tenantId: string | null
  client:
    | Readonly<{ kind: 'single', clientId: string }>
    | Readonly<{ kind: 'allowed_set', clientIds: readonly string[] }>
  permissions: readonly string[]
  correlationId: string
  source: 'authenticated_app' | 'authenticated_service' | 'signed_service_assertion'
}

export interface PlatformAgentScopeAssertionClaims {
  version: 1
  issuer: 'xeroflow-app'
  audience: 'xeroflow-platform-agents'
  subject: string
  actorType: 'user'
  authoritySource: 'authenticated_app'
  agent: PlatformAgentKey
  instanceId: string
  tenantId: string | null
  clientScopeKind: 'single' | 'allowed_set'
  clientIds: string[]
  permissions: string[]
  correlationId: string
  issuedAt: number
  expiresAt: number
  jti: string
}

export interface IssuePlatformAgentScopeAssertionInput {
  agent: PlatformAgentKey
  scope: PlatformAgentAssertionScope
  secret: string
  nowMs?: number
  ttlSeconds?: number
  jti?: string
}

export interface VerifyPlatformAgentScopeAssertionInput {
  token: string
  secret: string
  expectedAgent: PlatformAgentKey
  expectedInstanceId?: string
  nowMs?: number
}

const TOKEN_PREFIX = 'pasa1'
const SIGNATURE_DOMAIN = 'xeroflow:platform-agent-scope-assertion:v1:'
const INSTANCE_DOMAIN = 'xeroflow:platform-agent-instance:v1:'
const DEFAULT_TTL_SECONDS = 120
const MAX_TTL_SECONDS = 300
const MAX_CLOCK_SKEW_SECONDS = 30
const MAX_TOKEN_LENGTH = 8_192
const MAX_CLIENT_IDS = 128
const MAX_PERMISSIONS = 32
const MAX_IDENTIFIER_LENGTH = 255

const CLAIM_KEYS = [
  'version',
  'issuer',
  'audience',
  'subject',
  'actorType',
  'authoritySource',
  'agent',
  'instanceId',
  'tenantId',
  'clientScopeKind',
  'clientIds',
  'permissions',
  'correlationId',
  'issuedAt',
  'expiresAt',
  'jti'
] as const

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function requiredIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} required`)
  }
  const normalized = value.trim()
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`${label} exceeds ${MAX_IDENTIFIER_LENGTH} characters`)
  }
  return normalized
}

function optionalIdentifier(value: unknown, label: string): string | null {
  return value == null ? null : requiredIdentifier(value, label)
}

function normalizeSecret(secret: unknown): string {
  if (typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('signing secret must be at least 32 characters')
  }
  return secret.trim()
}

function normalizeAgent(agent: unknown): PlatformAgentKey {
  if (typeof agent !== 'string' || !PLATFORM_AGENT_KEYS.includes(agent as PlatformAgentKey)) {
    throw new Error('unsupported platform agent')
  }
  return agent as PlatformAgentKey
}

function normalizeStringSet(values: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`)
  if (values.length > maximum) throw new Error(`${label} exceeds ${maximum} entries`)
  return [...new Set(values.map(value => requiredIdentifier(value, label.slice(0, -1))))].sort()
}

function normalizeScope(scope: PlatformAgentAssertionScope): {
  subject: string
  tenantId: string | null
  clientScopeKind: 'single' | 'allowed_set'
  clientIds: string[]
  permissions: string[]
  correlationId: string
} {
  if (scope?.actor?.type !== 'user' || scope?.source !== 'authenticated_app') {
    throw new Error('authenticated user authority required')
  }

  let clientScopeKind: 'single' | 'allowed_set'
  let rawClientIds: unknown
  if (scope.client?.kind === 'single') {
    clientScopeKind = 'single'
    rawClientIds = [scope.client.clientId]
  } else if (scope.client?.kind === 'allowed_set') {
    clientScopeKind = 'allowed_set'
    rawClientIds = scope.client.clientIds
  } else {
    throw new Error('client scope is invalid')
  }

  const clientIds = normalizeStringSet(rawClientIds, 'clientIds', MAX_CLIENT_IDS)
  if (clientScopeKind === 'single' && clientIds.length !== 1) {
    throw new Error('single client scope requires exactly one client')
  }

  return {
    subject: requiredIdentifier(scope.actor.id, 'actor id'),
    tenantId: optionalIdentifier(scope.tenantId, 'tenantId'),
    clientScopeKind,
    clientIds,
    permissions: normalizeStringSet(scope.permissions, 'permissions', MAX_PERMISSIONS),
    correlationId: requiredIdentifier(scope.correlationId, 'correlationId')
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizeSecret(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
}

async function verifyHmac(data: string, signature: Uint8Array, secret: string): Promise<boolean> {
  if (signature.byteLength !== 32) return false
  const signatureBuffer = Uint8Array.from(signature).buffer
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizeSecret(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, signatureBuffer, encoder.encode(data))
}

function canonicalInstanceInput(agent: PlatformAgentKey, scope: ReturnType<typeof normalizeScope>): string {
  return JSON.stringify({
    version: 1,
    agent,
    subject: scope.subject,
    actorType: 'user',
    authoritySource: 'authenticated_app',
    tenantId: scope.tenantId,
    clientScopeKind: scope.clientScopeKind,
    clientIds: scope.clientIds,
    permissions: scope.permissions
  })
}

export async function derivePlatformAgentInstanceId(
  agentInput: PlatformAgentKey,
  scopeInput: PlatformAgentAssertionScope,
  secretInput: string
): Promise<string> {
  const agent = normalizeAgent(agentInput)
  const scope = normalizeScope(scopeInput)
  const digest = await hmac(`${INSTANCE_DOMAIN}${canonicalInstanceInput(agent, scope)}`, secretInput)
  return `pa_${encodeBase64Url(digest.slice(0, 24))}`
}

export async function issuePlatformAgentScopeAssertion(
  input: IssuePlatformAgentScopeAssertionInput
): Promise<{ token: string, claims: PlatformAgentScopeAssertionClaims }> {
  const agent = normalizeAgent(input.agent)
  const scope = normalizeScope(input.scope)
  const secret = normalizeSecret(input.secret)
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`ttlSeconds must be between 1 and ${MAX_TTL_SECONDS}`)
  }
  const nowMs = input.nowMs ?? Date.now()
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('nowMs is invalid')
  const issuedAt = Math.floor(nowMs / 1000)
  const jti = requiredIdentifier(input.jti ?? crypto.randomUUID(), 'jti')
  const instanceId = await derivePlatformAgentInstanceId(agent, input.scope, secret)
  const claims: PlatformAgentScopeAssertionClaims = {
    version: 1,
    issuer: 'xeroflow-app',
    audience: 'xeroflow-platform-agents',
    subject: scope.subject,
    actorType: 'user',
    authoritySource: 'authenticated_app',
    agent,
    instanceId,
    tenantId: scope.tenantId,
    clientScopeKind: scope.clientScopeKind,
    clientIds: scope.clientIds,
    permissions: scope.permissions,
    correlationId: scope.correlationId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    jti
  }
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)))
  const signed = `${TOKEN_PREFIX}.${payload}`
  const token = `${signed}.${encodeBase64Url(await hmac(`${SIGNATURE_DOMAIN}${signed}`, secret))}`
  if (token.length > MAX_TOKEN_LENGTH) throw new Error(`assertion exceeds ${MAX_TOKEN_LENGTH} characters`)
  return { token, claims }
}

function hasExactClaimKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === CLAIM_KEYS.length && keys.every((key, index) => key === [...CLAIM_KEYS].sort()[index])
}

function parseClaims(value: unknown): PlatformAgentScopeAssertionClaims | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const claims = value as Record<string, unknown>
  if (!hasExactClaimKeys(claims)) return null
  if (claims.version !== 1 || claims.issuer !== 'xeroflow-app' || claims.audience !== 'xeroflow-platform-agents') return null
  if (claims.actorType !== 'user' || claims.authoritySource !== 'authenticated_app') return null
  if (claims.clientScopeKind !== 'single' && claims.clientScopeKind !== 'allowed_set') return null
  if (!Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt)) return null

  try {
    const agent = normalizeAgent(claims.agent)
    const clientIds = normalizeStringSet(claims.clientIds, 'clientIds', MAX_CLIENT_IDS)
    const permissions = normalizeStringSet(claims.permissions, 'permissions', MAX_PERMISSIONS)
    if (JSON.stringify(clientIds) !== JSON.stringify(claims.clientIds)) return null
    if (JSON.stringify(permissions) !== JSON.stringify(claims.permissions)) return null
    if (claims.clientScopeKind === 'single' && clientIds.length !== 1) return null
    return {
      version: 1,
      issuer: 'xeroflow-app',
      audience: 'xeroflow-platform-agents',
      subject: requiredIdentifier(claims.subject, 'subject'),
      actorType: 'user',
      authoritySource: 'authenticated_app',
      agent,
      instanceId: requiredIdentifier(claims.instanceId, 'instanceId'),
      tenantId: optionalIdentifier(claims.tenantId, 'tenantId'),
      clientScopeKind: claims.clientScopeKind,
      clientIds,
      permissions,
      correlationId: requiredIdentifier(claims.correlationId, 'correlationId'),
      issuedAt: claims.issuedAt as number,
      expiresAt: claims.expiresAt as number,
      jti: requiredIdentifier(claims.jti, 'jti')
    }
  } catch {
    return null
  }
}

function scopeFromClaims(claims: PlatformAgentScopeAssertionClaims): PlatformAgentAssertionScope {
  return {
    actor: { type: 'user', id: claims.subject },
    tenantId: claims.tenantId,
    client: claims.clientScopeKind === 'single'
      ? { kind: 'single', clientId: claims.clientIds[0]! }
      : { kind: 'allowed_set', clientIds: claims.clientIds },
    permissions: claims.permissions,
    correlationId: claims.correlationId,
    source: 'authenticated_app'
  }
}

export async function verifyPlatformAgentScopeAssertion(
  input: VerifyPlatformAgentScopeAssertionInput
): Promise<PlatformAgentScopeAssertionClaims | null> {
  try {
    if (typeof input.token !== 'string' || input.token.length === 0 || input.token.length > MAX_TOKEN_LENGTH) return null
    const parts = input.token.split('.')
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null
    const [, payload, encodedSignature] = parts
    const signed = `${TOKEN_PREFIX}.${payload}`
    if (!(await verifyHmac(
      `${SIGNATURE_DOMAIN}${signed}`,
      decodeBase64Url(encodedSignature!),
      input.secret
    ))) return null

    const claims = parseClaims(JSON.parse(decoder.decode(decodeBase64Url(payload!))))
    if (!claims || claims.agent !== input.expectedAgent) return null
    const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000)
    if (claims.expiresAt <= nowSeconds) return null
    if (claims.issuedAt > nowSeconds + MAX_CLOCK_SKEW_SECONDS) return null
    if (claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > MAX_TTL_SECONDS) return null

    const canonicalInstanceId = await derivePlatformAgentInstanceId(claims.agent, scopeFromClaims(claims), input.secret)
    if (claims.instanceId !== canonicalInstanceId) return null
    if (input.expectedInstanceId && claims.instanceId !== input.expectedInstanceId) return null
    return claims
  } catch {
    return null
  }
}
