import { describe, expect, it, vi } from 'vitest'

import {
  MCP_REQUEST_AUDIENCE,
  canonicalMcpJson,
  deriveMcpLogicalIdempotencyKey,
  digestMcpRequestBody,
  signMcpRequestClaim,
  verifyMcpRequestClaim,
  type McpRequestClaim
} from '~~/shared/utils/mcpRequestClaim'
import {
  consumeMcpRequestClaim,
  getMcpRequestGodModeAuthority
} from '~~/server/utils/ai/mcp/requestClaim'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

const SECRET = 'test-request-signing-secret-with-enough-entropy'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const JTI = '33333333-3333-4333-8333-333333333333'
const NOW_MS = 1_800_000_000_000

function event(path: '/api/internal/mcp/tools' | '/api/internal/mcp/call') {
  return {
    method: 'POST',
    path,
    context: {},
    node: {
      req: {
        method: 'POST',
        originalUrl: path,
        url: path,
        headers: { host: 'agency-dashboard.test' }
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

async function activeOwner(eventValue: any, actorUserId: string) {
  return await resolveGodModeAuthority(eventValue, actorUserId, {
    queryOneFresh: async () => ({ id: actorUserId })
  })
}

async function ordinaryUser(eventValue: any, actorUserId: string) {
  return await resolveGodModeAuthority(eventValue, actorUserId, {
    queryOneFresh: async () => null
  })
}

async function rawSignedToken(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const body = Buffer.from(bytes).toString('base64url')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${Buffer.from(signature).toString('base64url')}`
}

async function claim(overrides: Partial<Omit<McpRequestClaim, 'jti' | 'exp'>> = {}, options = {}) {
  const body = overrides.path === '/api/internal/mcp/call'
    ? { userId: USER_ID, tool: overrides.toolName ?? 'get_tasks', args: { status: 'open' }, idempotencyKey: 'mcp:stable' }
    : { userId: USER_ID }
  return await signMcpRequestClaim({
    uid: USER_ID,
    scope: ['mcp:read'],
    godMode: false,
    audience: MCP_REQUEST_AUDIENCE,
    method: 'POST',
    path: '/api/internal/mcp/tools',
    bodyDigest: await digestMcpRequestBody(body),
    ...overrides
  }, SECRET, { now: NOW_MS, ttlSec: 30, jti: JTI, ...options })
}

describe('MCP exact-request claim Web Crypto contract', () => {
  it('canonicalizes nested JSON independently of property insertion order', async () => {
    const left = { z: [3, { b: true, a: 'x' }], a: { second: 2, first: 1 } }
    const right = { a: { first: 1, second: 2 }, z: [3, { a: 'x', b: true }] }

    expect(canonicalMcpJson(left)).toBe('{"a":{"first":1,"second":2},"z":[3,{"a":"x","b":true}]}')
    expect(await digestMcpRequestBody(left)).toBe(await digestMcpRequestBody(right))
  })

  it('round-trips a valid short-lived exact-request claim', async () => {
    const encoded = await claim()

    expect(await verifyMcpRequestClaim(encoded, SECRET, { now: NOW_MS })).toEqual({
      uid: USER_ID,
      scope: ['mcp:read'],
      godMode: false,
      jti: JTI,
      exp: Math.floor(NOW_MS / 1000) + 30,
      audience: MCP_REQUEST_AUDIENCE,
      method: 'POST',
      path: '/api/internal/mcp/tools',
      bodyDigest: await digestMcpRequestBody({ userId: USER_ID })
    })
  })

  it('fails closed for forged, expired, malformed, and missing-JTI claims', async () => {
    const valid = await claim()
    const [body, signature] = valid.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ uid: OTHER_USER_ID, exp: 9_999_999_999 })).toString('base64url')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString())
    delete decoded.jti
    const missingJti = await rawSignedToken(decoded)

    await expect(verifyMcpRequestClaim(`${forgedBody}.${signature}`, SECRET, { now: NOW_MS })).resolves.toBeNull()
    await expect(verifyMcpRequestClaim(valid, SECRET, { now: NOW_MS + 31_000 })).resolves.toBeNull()
    await expect(verifyMcpRequestClaim('malformed.claim.parts', SECRET, { now: NOW_MS })).resolves.toBeNull()
    await expect(verifyMcpRequestClaim(missingJti, SECRET, { now: NOW_MS })).resolves.toBeNull()
  })

  it('derives stable logical idempotency from OAuth session plus protocol request ID, never JTI', async () => {
    const first = await deriveMcpLogicalIdempotencyKey('oauth-session-a', 42)
    const retry = await deriveMcpLogicalIdempotencyKey('oauth-session-a', 42)
    const nextRequest = await deriveMcpLogicalIdempotencyKey('oauth-session-a', 43)
    const otherSession = await deriveMcpLogicalIdempotencyKey('oauth-session-b', 42)

    expect(first).toBe(retry)
    expect(first).toMatch(/^mcp:[0-9a-f]{64}$/)
    expect(nextRequest).not.toBe(first)
    expect(otherSession).not.toBe(first)
    expect(first).not.toContain(JTI)
  })
})

describe('Pages MCP claim consumption', () => {
  it('accepts one exact request, consumes its nonce, and exposes fresh owner authority for a stale false bit', async () => {
    const requestEvent = event('/api/internal/mcp/tools')
    const encoded = await claim()
    const consumeNonce = vi.fn().mockResolvedValue(true)

    const consumed = await consumeMcpRequestClaim(requestEvent, encoded, USER_ID, {
      signingSecret: SECRET,
      now: NOW_MS,
      body: { userId: USER_ID },
      scopeHeader: undefined,
      resolveAuthority: activeOwner,
      consumeNonce
    })

    expect(consumed.godMode).toBe(false)
    expect(consumeNonce).toHaveBeenCalledOnce()
    expect(getMcpRequestGodModeAuthority(requestEvent, USER_ID)?.active).toBe(true)
  })

  it('rejects cross-user, path, tool, body, scope-header, and true-bit downgrade mismatches before nonce consumption', async () => {
    const callBody = {
      userId: USER_ID,
      tool: 'get_tasks',
      args: { status: 'open' },
      idempotencyKey: 'mcp:stable'
    }
    const callEncoded = await claim({
      path: '/api/internal/mcp/call',
      toolName: 'get_tasks',
      bodyDigest: await digestMcpRequestBody(callBody)
    })
    const trueListEncoded = await claim({ godMode: true })

    const cases = [
      {
        name: 'cross-user',
        event: event('/api/internal/mcp/call'),
        encoded: callEncoded,
        userId: OTHER_USER_ID,
        body: { ...callBody, userId: OTHER_USER_ID },
        scopeHeader: undefined,
        resolveAuthority: ordinaryUser
      },
      {
        name: 'captured tools-list claim on call path',
        event: event('/api/internal/mcp/call'),
        encoded: await claim(),
        userId: USER_ID,
        body: callBody,
        scopeHeader: undefined,
        resolveAuthority: ordinaryUser
      },
      {
        name: 'different tool',
        event: event('/api/internal/mcp/call'),
        encoded: callEncoded,
        userId: USER_ID,
        body: { ...callBody, tool: 'get_briefs' },
        scopeHeader: undefined,
        resolveAuthority: ordinaryUser
      },
      {
        name: 'different arguments',
        event: event('/api/internal/mcp/call'),
        encoded: callEncoded,
        userId: USER_ID,
        body: { ...callBody, args: { status: 'closed' } },
        scopeHeader: undefined,
        resolveAuthority: ordinaryUser
      },
      {
        name: 'unsigned header adds scope',
        event: event('/api/internal/mcp/call'),
        encoded: callEncoded,
        userId: USER_ID,
        body: callBody,
        scopeHeader: 'mcp:read mcp:write',
        resolveAuthority: ordinaryUser
      },
      {
        name: 'database role downgrade',
        event: event('/api/internal/mcp/tools'),
        encoded: trueListEncoded,
        userId: USER_ID,
        body: { userId: USER_ID },
        scopeHeader: undefined,
        resolveAuthority: ordinaryUser
      }
    ]

    for (const testCase of cases) {
      const consumeNonce = vi.fn().mockResolvedValue(true)
      await expect(consumeMcpRequestClaim(testCase.event, testCase.encoded, testCase.userId, {
        signingSecret: SECRET,
        now: NOW_MS,
        body: testCase.body,
        scopeHeader: testCase.scopeHeader,
        resolveAuthority: testCase.resolveAuthority,
        consumeNonce
      }), testCase.name).rejects.toMatchObject({ statusCode: 403 })
      expect(consumeNonce, testCase.name).not.toHaveBeenCalled()
    }
  })

  it('rejects wrong audience, method, and unsupported scope even with a valid HMAC', async () => {
    const base = JSON.parse(Buffer.from((await claim()).split('.')[0], 'base64url').toString())
    const variants = [
      { ...base, audience: 'another-service' },
      { ...base, method: 'GET' },
      { ...base, scope: ['mcp:read', 'admin'] }
    ]

    for (const payload of variants) {
      await expect(verifyMcpRequestClaim(await rawSignedToken(payload), SECRET, { now: NOW_MS })).resolves.toBeNull()
    }
  })

  it('atomically rejects duplicate JTI replay after the first successful consumption', async () => {
    const encoded = await claim()
    const seen = new Set<string>()
    const consumeNonce = vi.fn(async (requestClaim: McpRequestClaim) => {
      if (seen.has(requestClaim.jti)) return false
      seen.add(requestClaim.jti)
      return true
    })
    const deps = {
      signingSecret: SECRET,
      now: NOW_MS,
      body: { userId: USER_ID },
      scopeHeader: undefined,
      resolveAuthority: ordinaryUser,
      consumeNonce
    }

    await consumeMcpRequestClaim(event('/api/internal/mcp/tools'), encoded, USER_ID, deps)
    await expect(consumeMcpRequestClaim(event('/api/internal/mcp/tools'), encoded, USER_ID, deps))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(consumeNonce).toHaveBeenCalledTimes(2)
  })
})
