export type PlatformAgentActor = Readonly<{
  type: 'user' | 'service'
  id: string
}>

export type PlatformAgentAuthoritySource = 'authenticated_app' | 'authenticated_service' | 'signed_service_assertion'

export interface PlatformAgentAuthorityInput {
  actor: PlatformAgentActor
  tenantId?: string | null
  allowedClientIds: readonly string[]
  permissions: readonly string[]
  correlationId: string
  source: PlatformAgentAuthoritySource
}

export type PlatformAgentAuthority = Readonly<{
  actor: PlatformAgentActor
  tenantId: string | null
  allowedClientIds: readonly string[]
  permissions: readonly string[]
  correlationId: string
  source: PlatformAgentAuthoritySource
}>

export type PlatformAgentClientScope
  = | Readonly<{ kind: 'single', clientId: string }>
    | Readonly<{ kind: 'allowed_set', clientIds: readonly string[] }>

export type PlatformAgentScope = Readonly<{
  actor: PlatformAgentActor
  tenantId: string | null
  client: PlatformAgentClientScope
  permissions: readonly string[]
  correlationId: string
  source: PlatformAgentAuthoritySource
}>

export type PlatformAgentScopeErrorCode
  = | 'INVALID_AUTHORITY'
    | 'TENANT_SCOPE_VIOLATION'
    | 'CLIENT_SCOPE_REQUIRED'
    | 'CLIENT_SCOPE_VIOLATION'

export class PlatformAgentScopeError extends Error {
  public readonly statusMessage: string

  constructor(
    public readonly code: PlatformAgentScopeErrorCode,
    public readonly statusCode: 400 | 403,
    message: string
  ) {
    super(message)
    this.name = 'PlatformAgentScopeError'
    this.statusMessage = message
  }
}

function requiredIdentifier(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlatformAgentScopeError('INVALID_AUTHORITY', 400, `${label} required`)
  }
  const normalized = value.trim()
  if (normalized.length > 255) {
    throw new PlatformAgentScopeError('INVALID_AUTHORITY', 400, `${label} is too long`)
  }
  return normalized
}

function optionalIdentifier(value: unknown, label: string) {
  if (value == null) return null
  return requiredIdentifier(value, label)
}

export function createPlatformAgentAuthority(input: PlatformAgentAuthorityInput): PlatformAgentAuthority {
  if (input.actor?.type !== 'user' && input.actor?.type !== 'service') {
    throw new PlatformAgentScopeError('INVALID_AUTHORITY', 400, 'actor type must be user or service')
  }
  if (input.source !== 'authenticated_app' && input.source !== 'authenticated_service' && input.source !== 'signed_service_assertion') {
    throw new PlatformAgentScopeError('INVALID_AUTHORITY', 400, 'authority source is invalid')
  }

  const actor = Object.freeze({
    type: input.actor.type,
    id: requiredIdentifier(input.actor.id, 'actor id')
  })
  const clientIds = input.allowedClientIds.map(clientId => requiredIdentifier(clientId, 'allowed client id'))
  const allowedClientIds = Object.freeze([...new Set(clientIds)])
  const permissionValues = input.permissions.map(permission => requiredIdentifier(permission, 'permission'))
  const permissions = Object.freeze([...new Set(permissionValues)])

  return Object.freeze({
    actor,
    tenantId: optionalIdentifier(input.tenantId, 'tenant id'),
    allowedClientIds,
    permissions,
    correlationId: requiredIdentifier(input.correlationId, 'correlation id'),
    source: input.source
  })
}

export function resolvePlatformAgentScope(
  authority: PlatformAgentAuthority,
  request: Readonly<{
    requestedTenantId?: string | null
    requestedClientId?: string | null
    clientSelection: 'required' | 'all_allowed'
  }>
): PlatformAgentScope {
  const requestedTenantId = optionalIdentifier(request.requestedTenantId, 'requested tenant id')
  if (requestedTenantId && requestedTenantId !== authority.tenantId) {
    throw new PlatformAgentScopeError(
      'TENANT_SCOPE_VIOLATION',
      403,
      'Requested tenant is outside the authenticated authority scope'
    )
  }

  const requestedClientId = optionalIdentifier(request.requestedClientId, 'requested client id')
  let client: PlatformAgentClientScope
  if (request.clientSelection === 'required') {
    if (!requestedClientId) {
      throw new PlatformAgentScopeError('CLIENT_SCOPE_REQUIRED', 400, 'clientId required')
    }
    if (!authority.allowedClientIds.includes(requestedClientId)) {
      throw new PlatformAgentScopeError(
        'CLIENT_SCOPE_VIOLATION',
        403,
        'Requested client is outside the authenticated authority scope'
      )
    }
    client = Object.freeze({ kind: 'single', clientId: requestedClientId })
  } else {
    if (requestedClientId && !authority.allowedClientIds.includes(requestedClientId)) {
      throw new PlatformAgentScopeError(
        'CLIENT_SCOPE_VIOLATION',
        403,
        'Requested client is outside the authenticated authority scope'
      )
    }
    client = requestedClientId
      ? Object.freeze({ kind: 'single', clientId: requestedClientId })
      : Object.freeze({ kind: 'allowed_set', clientIds: authority.allowedClientIds })
  }

  return Object.freeze({
    actor: authority.actor,
    tenantId: authority.tenantId,
    client,
    permissions: authority.permissions,
    correlationId: authority.correlationId,
    source: authority.source
  })
}
