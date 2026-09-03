import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  digestMcpRequestBody,
  verifyMcpRequestClaim
} from '~~/shared/utils/mcpRequestClaim'

const mocks = vi.hoisted(() => ({
  handlers: new Map<unknown, (...args: any[]) => Promise<any>>(),
  registerCapabilities: vi.fn(),
  sendToolListChanged: vi.fn(),
  completeAuthorization: vi.fn(),
  listSchema: { kind: 'tools/list' },
  callSchema: { kind: 'tools/call' }
}))

vi.mock('agents/mcp', () => ({
  McpAgent: class {
    env: any
    props: any
    static serve() { return { fetch: vi.fn() } }
  }
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    server = {
      registerCapabilities: mocks.registerCapabilities,
      oninitialized: undefined as undefined | (() => void),
      setRequestHandler: (schema: unknown, handler: (...args: any[]) => Promise<any>) => {
        mocks.handlers.set(schema, handler)
      }
    }
    sendToolListChanged = mocks.sendToolListChanged
  }
}))

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: mocks.listSchema,
  CallToolRequestSchema: mocks.callSchema
}))

vi.mock('@cloudflare/workers-oauth-provider', () => ({
  default: class {
    constructor(options: unknown) { return { options } }
  }
}))

const workerModule = await import('../../workers/mcp-server/src/index')
const { XeroFlowMcpAgent } = workerModule

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SIGNING_SECRET = 'worker-pages-request-signing-secret'

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function env() {
  return {
    APP_BASE_URL: 'https://agency-dashboard.test',
    MCP_INTERNAL_SECRET: 'internal-service-secret',
    MCP_REQUEST_SIGNING_SECRET: SIGNING_SECRET,
    OAUTH_PROVIDER: {
      parseAuthRequest: vi.fn(),
      completeAuthorization: mocks.completeAuthorization
    }
  } as any
}

function props() {
  return {
    userId: USER_ID,
    scope: ['mcp:read', 'mcp:write'],
    godMode: true,
    oauthSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  }
}

describe('standalone MCP Worker request authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('fetches and signs a fresh manifest for every tools/list request instead of caching at init', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({
      tools: [{ name: 'get_tasks', description: 'Tasks', inputSchema: { type: 'object' } }]
    }))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()

    await agent.init()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.registerCapabilities).toHaveBeenCalledWith({ tools: { listChanged: true } })

    agent.server.server.oninitialized?.()
    expect(mocks.sendToolListChanged).toHaveBeenCalledOnce()

    const list = mocks.handlers.get(mocks.listSchema)!
    const firstList = await list({}, { requestId: 1 })
    await list({}, { requestId: 2 })

    expect(firstList._meta).toEqual({
      catalogRelease: '2026-09-03.1',
      previousCatalogRelease: '2026-09-01.15',
      toolCount: 1,
      source: 'fresh_server_projection',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstInit = fetchMock.mock.calls[0]![1] as RequestInit
    const secondInit = fetchMock.mock.calls[1]![1] as RequestInit
    const firstHeader = new Headers(firstInit.headers).get('x-mcp-assertion')!
    const secondHeader = new Headers(secondInit.headers).get('x-mcp-assertion')!
    const firstClaim = await verifyMcpRequestClaim(firstHeader, SIGNING_SECRET)
    const secondClaim = await verifyMcpRequestClaim(secondHeader, SIGNING_SECRET)
    const expectedBody = { userId: USER_ID }

    expect(firstClaim).toMatchObject({
      uid: USER_ID,
      godMode: true,
      path: '/api/internal/mcp/tools',
      bodyDigest: await digestMcpRequestBody(expectedBody)
    })
    expect(secondClaim?.jti).not.toBe(firstClaim?.jti)
    expect(new Headers(firstInit.headers).has('x-mcp-scope')).toBe(false)
  })

  it('uses OAuth session plus SDK requestId for stable logical call idempotency while rotating JTI', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({ ok: true, data: { count: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()
    const call = mocks.handlers.get(mocks.callSchema)!
    const request = { params: { name: 'get_tasks', arguments: { status: 'open' } } }

    await call(request, { requestId: 'rpc-7' })
    await call(request, { requestId: 'rpc-7' })

    const firstInit = fetchMock.mock.calls[0]![1] as RequestInit
    const secondInit = fetchMock.mock.calls[1]![1] as RequestInit
    const firstBody = JSON.parse(String(firstInit.body))
    const secondBody = JSON.parse(String(secondInit.body))
    const firstClaim = await verifyMcpRequestClaim(new Headers(firstInit.headers).get('x-mcp-assertion')!, SIGNING_SECRET)
    const secondClaim = await verifyMcpRequestClaim(new Headers(secondInit.headers).get('x-mcp-assertion')!, SIGNING_SECRET)

    expect(firstBody.idempotencyKey).toMatch(/^mcp:[0-9a-f]{64}$/)
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey)
    expect(secondClaim?.jti).not.toBe(firstClaim?.jti)
    expect(firstClaim).toMatchObject({
      toolName: 'get_tasks',
      bodyDigest: await digestMcpRequestBody(firstBody)
    })
  })

  it('does not collide when one OAuth session reuses a protocol request ID for a different body or tool', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({ ok: true, data: { count: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()
    const call = mocks.handlers.get(mocks.callSchema)!

    await call({ params: { name: 'get_tasks', arguments: { status: 'open' } } }, { requestId: 'rpc-reused' })
    await call({ params: { name: 'get_tasks', arguments: { status: 'closed' } } }, { requestId: 'rpc-reused' })
    await call({ params: { name: 'get_briefs', arguments: { status: 'open' } } }, { requestId: 'rpc-reused' })

    const keys = fetchMock.mock.calls.map(callArgs => JSON.parse(String((callArgs[1] as RequestInit).body)).idempotencyKey)
    expect(new Set(keys).size).toBe(3)
  })

  it('returns structured tool failures without stringifying booleans', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({
      ok: false,
      error: 'This model requires at least one approved source asset.',
      code: 'missing_approved_source_asset',
      details: {
        error: 'missing_approved_source_asset',
        requirement: 'requiresApprovedSourceAsset',
        model: 'kling-v2'
      }
    }))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()

    const call = mocks.handlers.get(mocks.callSchema)!
    const result = await call({ params: { name: 'propose_video_generation', arguments: {} } }, { requestId: 'rpc-error' })

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: 'missing_approved_source_asset',
      message: 'This model requires at least one approved source asset.',
      requirement: 'requiresApprovedSourceAsset',
      model: 'kling-v2'
    })
  })

  it('normalizes a malformed boolean error from Pages', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({ ok: false, error: true }))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()

    const call = mocks.handlers.get(mocks.callSchema)!
    const result = await call({ params: { name: 'get_capabilities', arguments: {} } }, { requestId: 'rpc-bool-error' })

    expect(JSON.parse(result.content[0].text)).toEqual({ error: 'tool_failed', message: 'Tool failed.' })
  })

  it('returns a bounded retryable diagnostic when the Pages call endpoint is unavailable', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseJson({
      statusCode: 503,
      statusMessage: 'God mode audit unavailable',
    }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()

    const call = mocks.handlers.get(mocks.callSchema)!
    const result = await call({ params: { name: 'get_capabilities', arguments: {} } }, { requestId: 'rpc-upstream-error' })

    expect(JSON.parse(result.content[0].text)).toEqual({
      error: 'mcp_upstream_unavailable',
      message: 'XeroFlow could not complete the tool call because its application service is temporarily unavailable.',
      retryable: true,
      upstreamStatus: 503,
    })
  })

  it('rejects unsupported or non-finite SDK request IDs before calling Pages', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const agent = new XeroFlowMcpAgent() as any
    agent.env = env()
    agent.props = props()
    await agent.init()
    const call = mocks.handlers.get(mocks.callSchema)!
    const request = { params: { name: 'get_tasks', arguments: {} } }

    await expect(call(request, { requestId: Number.NaN })).rejects.toThrow(TypeError)
    await expect(call(request, { requestId: Number.POSITIVE_INFINITY })).rejects.toThrow(TypeError)
    await expect(call(request, { requestId: { nested: true } })).rejects.toThrow(TypeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores only the exchange-derived owner bit and a persistent OAuth session ID in token props', async () => {
    const requestState = Buffer.from(JSON.stringify({ clientId: 'client-1', scope: ['mcp:read'] })).toString('base64url')
    const fetchMock = vi.fn().mockResolvedValue(responseJson({
      userId: USER_ID,
      scope: ['mcp:read'],
      godMode: true
    }))
    vi.stubGlobal('fetch', fetchMock)
    mocks.completeAuthorization.mockResolvedValue({ redirectTo: 'https://client.test/callback' })
    const provider = workerModule.default as any
    const authHandler = provider.options.defaultHandler

    await authHandler.fetch(new Request(
      `https://mcp.test/callback?state=${requestState}&assertion=oauth-assertion&godMode=false`
    ), env())

    const authorization = mocks.completeAuthorization.mock.calls[0]![0]
    expect(authorization.props).toMatchObject({ userId: USER_ID, scope: ['mcp:read'], godMode: true })
    expect(authorization.props.oauthSessionId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
