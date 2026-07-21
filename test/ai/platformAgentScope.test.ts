import { describe, expect, it } from 'vitest'
import {
  PlatformAgentScopeError,
  createPlatformAgentAuthority,
  resolvePlatformAgentScope,
} from '~~/server/utils/ai/platformAgentScope'

describe('platform agent authority scope', () => {
  const authority = () => createPlatformAgentAuthority({
    actor: { type: 'user', id: 'user-1' },
    tenantId: 'tenant-a',
    allowedClientIds: ['client-a', ' client-b ', 'client-a'],
    permissions: ['finance:read', ' finance:read ', 'clients:read'],
    correlationId: 'request-1',
    source: 'authenticated_app',
  })

  it('normalizes and deeply freezes server-derived authority', () => {
    const value = authority()

    expect(value.allowedClientIds).toEqual(['client-a', 'client-b'])
    expect(value.permissions).toEqual(['finance:read', 'clients:read'])
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.actor)).toBe(true)
    expect(Object.isFrozen(value.allowedClientIds)).toBe(true)
    expect(Object.isFrozen(value.permissions)).toBe(true)
  })

  it('rejects a requested tenant that differs from the authenticated tenant', () => {
    expect(() => resolvePlatformAgentScope(authority(), {
      requestedTenantId: 'tenant-b',
      clientSelection: 'all_allowed',
    })).toThrowError(expect.objectContaining<Partial<PlatformAgentScopeError>>({
      code: 'TENANT_SCOPE_VIOLATION',
      statusCode: 403,
    }))
  })

  it('rejects a client outside the authenticated allow-list', () => {
    expect(() => resolvePlatformAgentScope(authority(), {
      requestedClientId: 'client-c',
      clientSelection: 'required',
    })).toThrowError(expect.objectContaining<Partial<PlatformAgentScopeError>>({
      code: 'CLIENT_SCOPE_VIOLATION',
      statusCode: 403,
    }))
  })

  it('requires an explicit client for client-specific tools', () => {
    expect(() => resolvePlatformAgentScope(authority(), {
      clientSelection: 'required',
    })).toThrowError(expect.objectContaining<Partial<PlatformAgentScopeError>>({
      code: 'CLIENT_SCOPE_REQUIRED',
      statusCode: 400,
    }))
  })

  it('returns only the selected client for client-specific tools', () => {
    const scope = resolvePlatformAgentScope(authority(), {
      requestedClientId: 'client-b',
      clientSelection: 'required',
    })

    expect(scope).toMatchObject({
      tenantId: 'tenant-a',
      client: { kind: 'single', clientId: 'client-b' },
      correlationId: 'request-1',
      permissions: ['finance:read', 'clients:read'],
    })
    expect(Object.isFrozen(scope)).toBe(true)
    expect(Object.isFrozen(scope.client)).toBe(true)
  })

  it('represents agency-wide reads as the explicit authenticated client set', () => {
    const scope = resolvePlatformAgentScope(authority(), {
      clientSelection: 'all_allowed',
    })

    expect(scope.client).toEqual({
      kind: 'allowed_set',
      clientIds: ['client-a', 'client-b'],
    })
    expect(Object.isFrozen(scope.client)).toBe(true)
    expect(Object.isFrozen(scope.client.clientIds)).toBe(true)
  })

  it.each([
    ['missing actor id', { actor: { type: 'user', id: ' ' } }],
    ['missing correlation id', { correlationId: ' ' }],
    ['blank allowed client id', { allowedClientIds: ['client-a', ' '] }],
  ])('rejects malformed authority: %s', (_label, override) => {
    expect(() => createPlatformAgentAuthority({
      actor: { type: 'user', id: 'user-1' },
      tenantId: 'tenant-a',
      allowedClientIds: ['client-a'],
      permissions: ['finance:read'],
      correlationId: 'request-1',
      source: 'authenticated_app',
      ...override,
    } as any)).toThrow(PlatformAgentScopeError)
  })
})
