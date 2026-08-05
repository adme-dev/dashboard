import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createEvent } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MCP_REQUEST_AUDIENCE,
  digestMcpRequestBody,
  signMcpRequestClaim
} from '~~/shared/utils/mcpRequestClaim'
import { aiInternalFetch } from '~~/server/utils/ai/internalFetch'
import { consumeMcpRequestClaim } from '~~/server/utils/ai/mcp/requestClaim'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  consumeGodModeInternalExecutionDelegation,
  verifyGodModeInternalExecutionClaim
} from '~~/server/utils/godMode/internalExecutionDelegation'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const MCP_SECRET = 'mcp-read-bridge-request-signing-secret-32-bytes'
const EXECUTION_SECRET = 'mcp-read-bridge-internal-execution-secret-32-bytes'
const IDEMPOTENCY_KEY = `mcp:${'a'.repeat(64)}`
const NOW = 2_000_000_000_000

type SourceBody = { userId: string, tool: string, args: unknown, idempotencyKey: string }

function sourceEvent(body: SourceBody, headers: Record<string, string> = {}) {
  const bytes = Buffer.from(JSON.stringify(body))
  const request = Readable.from([bytes]) as unknown as IncomingMessage
  request.method = 'POST'
  request.url = '/api/internal/mcp/call'
  request.headers = {
    host: 'app.xeroflow.test',
    'content-type': 'application/json',
    'content-length': String(bytes.byteLength),
    'x-mcp-secret': 'transport-secret',
    'x-mcp-assertion': 'transport-assertion',
    'x-mcp-scope': 'mcp:read mcp:write',
    authorization: 'Bearer transport-token',
    cookie: 'auth_token=transport-cookie',
    ...headers
  }
  const event = createEvent(request, { writableEnded: false, headersSent: false } as ServerResponse)
  ;(event.context as any).cloudflare = { env: { GOD_MODE_INTERNAL_EXECUTION_SECRET: EXECUTION_SECRET } }
  return event
}

async function brandConsumedMcpOwnerCall(event: ReturnType<typeof sourceEvent>, body: SourceBody, actor = OWNER_ID) {
  const encoded = await signMcpRequestClaim({
    uid: actor,
    scope: ['mcp:read', 'mcp:write'],
    godMode: actor === OWNER_ID,
    audience: MCP_REQUEST_AUDIENCE,
    method: 'POST',
    path: '/api/internal/mcp/call',
    toolName: body.tool,
    bodyDigest: await digestMcpRequestBody(body)
  }, MCP_SECRET, { now: NOW })

  await consumeMcpRequestClaim(event, encoded, actor, {
    signingSecret: MCP_SECRET,
    now: NOW,
    scopeHeader: 'mcp:read mcp:write',
    resolveAuthority: async (request, userId) => await resolveGodModeAuthority(request, userId, {
      queryOneFresh: async () => actor === OWNER_ID ? { id: OWNER_ID } : null
    }),
    consumeNonce: async () => true
  })
}

function ctx(event: ReturnType<typeof sourceEvent>, userId = OWNER_ID, source: ToolContext['source'] = 'mcp'): ToolContext {
  return { userId, userRole: userId === OWNER_ID ? 'owner' : 'admin', source, event }
}

describe('AI internal GET delegation', () => {
  const originalFetch = (globalThis as any).$fetch
  const fetchMock = vi.fn(async () => ({ ok: true }))

  beforeEach(() => {
    fetchMock.mockClear()
    ;(globalThis as any).$fetch = fetchMock
  })

  afterEach(() => {
    ;(globalThis as any).$fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('mints an exact one-time GET delegation for a consumed MCP owner call and strips transport authority', async () => {
    const body = { userId: OWNER_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)

    await aiInternalFetch('/api/xero/invoices', {}, ctx(event))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, options] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/xero/invoices')
    const headers = new Headers((options as any).headers)
    const encoded = headers.get(GOD_MODE_INTERNAL_EXECUTION_HEADER)
    expect(encoded).toBeTruthy()
    for (const name of ['authorization', 'cookie', 'x-mcp-secret', 'x-mcp-assertion', 'x-mcp-scope']) {
      expect(headers.has(name)).toBe(false)
    }

    await expect(verifyGodModeInternalExecutionClaim(encoded!, EXECUTION_SECRET))
      .resolves.toMatchObject({
        actorUserId: OWNER_ID,
        routeOrTool: body.tool,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'GET',
        path: '/api/xero/invoices',
        bodyDigest: await digestMcpRequestBody(null)
      })

    const consumed = new Set<string>()
    const dependencies = {
      signingSecret: EXECUTION_SECRET,
      encoded: encoded!,
      method: 'GET',
      path: '/api/xero/invoices',
      body: null,
      resolveAuthority: async (request: any) => await resolveGodModeAuthority(request, OWNER_ID, {
        queryOneFresh: async () => ({ id: OWNER_ID })
      }),
      consumeNonce: async (jti: string) => {
        if (consumed.has(jti)) return false
        consumed.add(jti)
        return true
      }
    }
    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, dependencies)).resolves.toBeTruthy()
    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, dependencies))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('mints distinct one-time claims with the same logical identity for parallel finance reads', async () => {
    const body = { userId: OWNER_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)

    await Promise.all([
      aiInternalFetch('/api/xero/get-out/cash-position', {}, ctx(event)),
      aiInternalFetch('/api/xero/invoices', {}, ctx(event))
    ])

    const claims = await Promise.all(fetchMock.mock.calls.map(async ([, options]) => {
      const encoded = new Headers((options as any).headers).get(GOD_MODE_INTERNAL_EXECUTION_HEADER)!
      return await verifyGodModeInternalExecutionClaim(encoded, EXECUTION_SECRET)
    }))
    expect(claims).toHaveLength(2)
    expect(claims[0]?.jti).not.toBe(claims[1]?.jti)
    expect(claims.map(claim => claim?.idempotencyKey)).toEqual([IDEMPOTENCY_KEY, IDEMPOTENCY_KEY])
  })

  it('signs and fetches the same canonical path plus query and rejects query drift before nonce consumption', async () => {
    const body = { userId: OWNER_ID, tool: 'get_crm_pipeline', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)

    await aiInternalFetch('/api/crm/pipeline', { query: { client_id: CLIENT_ID } }, ctx(event))
    const [path, options] = fetchMock.mock.calls[0]!
    expect(path).toBe(`/api/crm/pipeline?client_id=${CLIENT_ID}`)
    const encoded = new Headers((options as any).headers).get(GOD_MODE_INTERNAL_EXECUTION_HEADER)!
    const consumeNonce = vi.fn(async () => true)

    await expect(consumeGodModeInternalExecutionDelegation({ context: {} } as any, {
      signingSecret: EXECUTION_SECRET,
      encoded,
      method: 'GET',
      path: `/api/crm/pipeline?client_id=${OWNER_ID}`,
      body: null,
      resolveAuthority: async request => await resolveGodModeAuthority(request, OWNER_ID, {
        queryOneFresh: async () => ({ id: OWNER_ID })
      }),
      consumeNonce
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(consumeNonce).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example/api/xero/invoices',
    '//evil.example/api/xero/invoices',
    '/api/xero/../admin/users',
    '/api/xero/invoices?admin=true',
    '/api/crm/ai/draft-followup'
  ])('fails closed before fetch for an unallowlisted MCP read target: %s', async (path) => {
    const body = { userId: OWNER_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)

    await expect(aiInternalFetch(path, {}, ctx(event))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed for an MCP event without the private consumed owner authority even with spoofed headers', async () => {
    const body = { userId: OWNER_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body, { [GOD_MODE_INTERNAL_EXECUTION_HEADER]: 'spoofed' })

    await expect(aiInternalFetch('/api/xero/invoices', {}, ctx(event))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed for freshly consumed non-owner MCP authority', async () => {
    const body = { userId: ADMIN_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body, ADMIN_ID)

    await expect(aiInternalFetch('/api/xero/invoices', {}, ctx(event, ADMIN_ID))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails before fetch when the internal execution signing secret is unavailable', async () => {
    const body = { userId: OWNER_ID, tool: 'get_finance_snapshot', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)
    delete (event.context as any).cloudflare.env.GOD_MODE_INTERNAL_EXECUTION_SECRET
    vi.stubEnv('GOD_MODE_INTERNAL_EXECUTION_SECRET', '')

    await expect(aiInternalFetch('/api/xero/invoices', {}, ctx(event))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('delegates only the exact UUID-bound draft-only POST body', async () => {
    const body = { userId: OWNER_ID, tool: 'draft_followup', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body)
    await brandConsumedMcpOwnerCall(event, body)
    const draftBody = { client_id: CLIENT_ID, opportunity_id: ADMIN_ID }

    await aiInternalFetch('/api/crm/ai/draft-followup', { method: 'POST', body: draftBody }, ctx(event))

    const [path, options] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/crm/ai/draft-followup')
    expect((options as any).body).toEqual(draftBody)
    const encoded = new Headers((options as any).headers).get(GOD_MODE_INTERNAL_EXECUTION_HEADER)!
    await expect(verifyGodModeInternalExecutionClaim(encoded, EXECUTION_SECRET)).resolves.toMatchObject({
      method: 'POST',
      path,
      bodyDigest: await digestMcpRequestBody(draftBody)
    })

    fetchMock.mockClear()
    await expect(aiInternalFetch('/api/crm/ai/draft-followup', {
      method: 'POST',
      body: { ...draftBody, extra: true }
    }, ctx(event))).rejects.toThrow()
    await expect(aiInternalFetch('/api/crm/opportunities', {
      method: 'POST',
      body: draftBody
    }, ctx(event))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves ordinary application session behavior while stripping a raw delegation header', async () => {
    const body = { userId: OWNER_ID, tool: 'unused', args: {}, idempotencyKey: IDEMPOTENCY_KEY }
    const event = sourceEvent(body, {
      authorization: 'Bearer staff-session',
      cookie: 'auth_token=staff-session-cookie',
      [GOD_MODE_INTERNAL_EXECUTION_HEADER]: 'spoofed'
    })

    await aiInternalFetch('/api/xero/invoices', {}, ctx(event, OWNER_ID, 'chat'))

    const headers = new Headers((fetchMock.mock.calls[0]![1] as any).headers)
    expect(headers.get('authorization')).toBe('Bearer staff-session')
    expect(headers.get('cookie')).toBe('auth_token=staff-session-cookie')
    expect(headers.has(GOD_MODE_INTERNAL_EXECUTION_HEADER)).toBe(false)
  })
})
