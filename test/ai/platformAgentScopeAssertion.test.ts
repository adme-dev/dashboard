import { describe, expect, it } from 'vitest'
import {
  derivePlatformAgentInstanceId,
  issuePlatformAgentScopeAssertion,
  verifyPlatformAgentScopeAssertion
} from '~~/shared/utils/platformAgentScopeAssertion'

const SECRET = 'platform-agent-scope-test-secret-at-least-32-bytes'
const NOW_MS = Date.UTC(2026, 6, 21, 1, 2, 3)

function userScope(overrides: Record<string, unknown> = {}) {
  return {
    actor: { type: 'user' as const, id: 'user-123' },
    tenantId: 'tenant-123',
    client: { kind: 'allowed_set' as const, clientIds: ['client-2', 'client-1', 'client-2'] },
    permissions: ['FINANCE', 'CLIENTS', 'FINANCE'],
    correlationId: 'correlation-123',
    source: 'authenticated_app' as const,
    ...overrides
  }
}

describe('platform agent scope assertions', () => {
  it('issues and verifies a short-lived user, agent, instance, tenant, and client-bound assertion', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'financial-watch',
      scope: userScope(),
      secret: SECRET,
      nowMs: NOW_MS,
      jti: 'assertion-123'
    })

    expect(issued.token).toMatch(/^pasa1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(issued.token).not.toContain(SECRET)
    expect(issued.claims).toMatchObject({
      version: 1,
      issuer: 'xeroflow-app',
      audience: 'xeroflow-platform-agents',
      subject: 'user-123',
      actorType: 'user',
      agent: 'financial-watch',
      tenantId: 'tenant-123',
      clientScopeKind: 'allowed_set',
      clientIds: ['client-1', 'client-2'],
      permissions: ['CLIENTS', 'FINANCE'],
      correlationId: 'correlation-123',
      jti: 'assertion-123',
      issuedAt: Math.floor(NOW_MS / 1000),
      expiresAt: Math.floor(NOW_MS / 1000) + 120
    })

    await expect(verifyPlatformAgentScopeAssertion({
      token: issued.token,
      secret: SECRET,
      expectedAgent: 'financial-watch',
      expectedInstanceId: issued.claims.instanceId,
      nowMs: NOW_MS + 60_000
    })).resolves.toEqual(issued.claims)
  })

  it('rejects payload and signature tampering', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'spend-controller',
      scope: userScope({ tenantId: null }),
      secret: SECRET,
      nowMs: NOW_MS,
      jti: 'assertion-123'
    })
    const [prefix, payload, signature] = issued.token.split('.')
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
    decoded.subject = 'attacker'
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    const tamperedSignature = `${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`

    await expect(verifyPlatformAgentScopeAssertion({
      token: `${prefix}.${tamperedPayload}.${signature}`,
      secret: SECRET,
      expectedAgent: 'spend-controller',
      nowMs: NOW_MS
    })).resolves.toBeNull()
    await expect(verifyPlatformAgentScopeAssertion({
      token: `${prefix}.${payload}.${tamperedSignature}`,
      secret: SECRET,
      expectedAgent: 'spend-controller',
      nowMs: NOW_MS
    })).resolves.toBeNull()
  })

  it('rejects expired, not-yet-issued, and overlong assertions', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'publishing-planner',
      scope: userScope({
        tenantId: null,
        client: { kind: 'single', clientId: 'client-1' }
      }),
      secret: SECRET,
      nowMs: NOW_MS,
      jti: 'assertion-123'
    })

    await expect(verifyPlatformAgentScopeAssertion({
      token: issued.token,
      secret: SECRET,
      expectedAgent: 'publishing-planner',
      nowMs: NOW_MS + 120_000
    })).resolves.toBeNull()
    await expect(verifyPlatformAgentScopeAssertion({
      token: issued.token,
      secret: SECRET,
      expectedAgent: 'publishing-planner',
      nowMs: NOW_MS - 31_000
    })).resolves.toBeNull()
    await expect(issuePlatformAgentScopeAssertion({
      agent: 'publishing-planner',
      scope: userScope({ tenantId: null }),
      secret: SECRET,
      nowMs: NOW_MS,
      ttlSeconds: 301
    })).rejects.toThrow('ttlSeconds must be between 1 and 300')
  })

  it('rejects agent and instance confusion', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'traffic-controller',
      scope: userScope({ tenantId: null }),
      secret: SECRET,
      nowMs: NOW_MS,
      jti: 'assertion-123'
    })

    await expect(verifyPlatformAgentScopeAssertion({
      token: issued.token,
      secret: SECRET,
      expectedAgent: 'spend-controller',
      nowMs: NOW_MS
    })).resolves.toBeNull()
    await expect(verifyPlatformAgentScopeAssertion({
      token: issued.token,
      secret: SECRET,
      expectedAgent: 'traffic-controller',
      expectedInstanceId: 'pa_wrong-instance',
      nowMs: NOW_MS
    })).resolves.toBeNull()
  })

  it('derives stable opaque instances from normalized immutable authority and changes on every authority dimension', async () => {
    const base = userScope({ tenantId: null })
    const reordered = userScope({
      tenantId: null,
      client: { kind: 'allowed_set', clientIds: ['client-1', 'client-2'] },
      permissions: ['CLIENTS', 'FINANCE']
    })
    const baseId = await derivePlatformAgentInstanceId('spend-controller', base, SECRET)

    expect(baseId).toMatch(/^pa_[A-Za-z0-9_-]{32}$/)
    await expect(derivePlatformAgentInstanceId('spend-controller', reordered, SECRET)).resolves.toBe(baseId)
    await expect(derivePlatformAgentInstanceId('financial-watch', base, SECRET)).resolves.not.toBe(baseId)
    await expect(derivePlatformAgentInstanceId('spend-controller', userScope({
      tenantId: null,
      actor: { type: 'user', id: 'user-456' }
    }), SECRET)).resolves.not.toBe(baseId)
    await expect(derivePlatformAgentInstanceId('spend-controller', userScope({
      tenantId: null,
      client: { kind: 'single', clientId: 'client-1' }
    }), SECRET)).resolves.not.toBe(baseId)
    await expect(derivePlatformAgentInstanceId('spend-controller', userScope({
      tenantId: 'tenant-456'
    }), SECRET)).resolves.not.toBe(baseId)
  })

  it('fails closed for service authority, invalid identifiers, excessive scope, and weak secrets', async () => {
    await expect(issuePlatformAgentScopeAssertion({
      agent: 'spend-controller',
      scope: userScope({
        actor: { type: 'service', id: 'worker' },
        source: 'authenticated_service'
      }),
      secret: SECRET,
      nowMs: NOW_MS
    })).rejects.toThrow('authenticated user authority required')
    await expect(issuePlatformAgentScopeAssertion({
      agent: 'spend-controller',
      scope: userScope({ correlationId: ' ' }),
      secret: SECRET,
      nowMs: NOW_MS
    })).rejects.toThrow('correlationId required')
    await expect(issuePlatformAgentScopeAssertion({
      agent: 'spend-controller',
      scope: userScope({
        client: { kind: 'allowed_set', clientIds: Array.from({ length: 129 }, (_, index) => `client-${index}`) }
      }),
      secret: SECRET,
      nowMs: NOW_MS
    })).rejects.toThrow('clientIds exceeds 128 entries')
    await expect(issuePlatformAgentScopeAssertion({
      agent: 'spend-controller',
      scope: userScope(),
      secret: 'too-short',
      nowMs: NOW_MS
    })).rejects.toThrow('signing secret must be at least 32 characters')
  })

  it('rejects malformed and oversized tokens without throwing', async () => {
    for (const token of ['', 'abc', 'pasa1.payload.signature.extra', `pasa1.${'a'.repeat(8_193)}.sig`]) {
      await expect(verifyPlatformAgentScopeAssertion({
        token,
        secret: SECRET,
        expectedAgent: 'spend-controller',
        nowMs: NOW_MS
      })).resolves.toBeNull()
    }
  })
})
