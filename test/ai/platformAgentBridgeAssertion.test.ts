/* eslint-disable @typescript-eslint/no-explicit-any -- Nuxt auto-import request shims use minimal test events. */
import { describe, expect, it } from 'vitest'
import { issuePlatformAgentScopeAssertion } from '~~/shared/utils/platformAgentScopeAssertion'
import {
  optionalPlatformAgentAssertionAuthority,
  platformAgentAuthorityFromScopeAssertion
} from '~~/server/utils/ai/platformAgentBridgeAssertion'

const SECRET = 'platform-agent-scope-test-secret-at-least-32-bytes'
const NOW_MS = Date.UTC(2026, 6, 21, 4, 5, 6)

;(globalThis as any).getHeader = (event: any, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name]

async function assertion(
  agent: 'spend-controller' | 'publishing-planner' | 'financial-watch' | 'traffic-controller',
  permissions: string[]
) {
  return issuePlatformAgentScopeAssertion({
    agent,
    scope: {
      actor: { type: 'user', id: 'user-123' },
      tenantId: agent === 'financial-watch' ? 'tenant-123' : null,
      client: { kind: 'allowed_set', clientIds: ['client-2', 'client-1'] },
      permissions,
      correlationId: 'correlation-123',
      source: 'authenticated_app'
    },
    secret: SECRET,
    nowMs: NOW_MS,
    jti: 'assertion-123'
  })
}

describe('platform agent app bridge assertions', () => {
  it('reconstructs a least-privilege signed user authority after independent verification', async () => {
    const issued = await assertion('financial-watch', ['FINANCE'])

    await expect(platformAgentAuthorityFromScopeAssertion({
      assertion: issued.token,
      expectedAgent: 'financial-watch',
      secret: SECRET,
      nowMs: NOW_MS + 1_000
    })).resolves.toEqual({
      actor: { type: 'user', id: 'user-123' },
      tenantId: 'tenant-123',
      allowedClientIds: ['client-1', 'client-2'],
      permissions: ['FINANCE'],
      correlationId: 'correlation-123',
      source: 'signed_service_assertion'
    })
  })

  it.each([
    ['spend-controller', ['MEDIA_BUYING']],
    ['publishing-planner', ['CREATIVE']],
    ['financial-watch', ['FINANCE']],
    ['traffic-controller', ['ADMIN']]
  ] as const)('accepts the required %s department permission', async (agent, permissions) => {
    const issued = await assertion(agent, [...permissions])
    const authority = await platformAgentAuthorityFromScopeAssertion({
      assertion: issued.token,
      expectedAgent: agent,
      secret: SECRET,
      nowMs: NOW_MS
    })

    expect(authority?.permissions).toEqual([...permissions])
  })

  it('fails closed for agent confusion, insufficient department permission, expiry, and missing configuration', async () => {
    const issued = await assertion('publishing-planner', ['CLIENTS'])

    await expect(platformAgentAuthorityFromScopeAssertion({
      assertion: issued.token,
      expectedAgent: 'spend-controller',
      secret: SECRET,
      nowMs: NOW_MS
    })).resolves.toBeNull()
    const insufficient = await assertion('publishing-planner', ['FINANCE'])
    await expect(platformAgentAuthorityFromScopeAssertion({
      assertion: insufficient.token,
      expectedAgent: 'publishing-planner',
      secret: SECRET,
      nowMs: NOW_MS
    })).resolves.toBeNull()
    await expect(platformAgentAuthorityFromScopeAssertion({
      assertion: issued.token,
      expectedAgent: 'publishing-planner',
      secret: SECRET,
      nowMs: NOW_MS + 120_000
    })).resolves.toBeNull()
    await expect(platformAgentAuthorityFromScopeAssertion({
      assertion: issued.token,
      expectedAgent: 'publishing-planner',
      secret: '',
      nowMs: NOW_MS
    })).resolves.toBeNull()
  })

  it('uses an assertion when present, rejects invalid downgrade attempts, and preserves legacy service fallback when absent', async () => {
    const previousSecret = process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET
    process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET = SECRET
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'traffic-controller',
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: null,
        client: { kind: 'single', clientId: 'client-123' },
        permissions: ['ADMIN'],
        correlationId: 'correlation-123',
        source: 'authenticated_app'
      },
      secret: SECRET
    })

    await expect(optionalPlatformAgentAssertionAuthority({
      headers: { 'x-platform-agent-scope-assertion': issued.token }
    } as any, 'traffic-controller')).resolves.toMatchObject({
      actor: { type: 'user', id: 'user-123' },
      allowedClientIds: ['client-123'],
      source: 'signed_service_assertion'
    })
    await expect(optionalPlatformAgentAssertionAuthority({
      headers: { 'x-platform-agent-scope-assertion': `${issued.token}x` }
    } as any, 'traffic-controller')).rejects.toMatchObject({ statusCode: 401 })
    await expect(optionalPlatformAgentAssertionAuthority({ headers: {} } as any, 'traffic-controller')).resolves.toBeNull()

    if (previousSecret == null) delete process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET
    else process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET = previousSecret
  })
})
