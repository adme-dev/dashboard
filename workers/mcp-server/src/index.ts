// workers/mcp-server/src/index.ts
//
// XeroFlow standalone MCP transport.
//
// Security-critical projection/execution remains in Pages and is reached over
// /api/internal/mcp/{tools,call}. This Worker is the thin OAuth + MCP transport and signs every exact
// list/call request with an independent short-lived one-time claim. No tool logic or DB lives here.
//
// Architecture (thin proxy):
//   external host ──OAuth──▶ Worker ──service secret + signed exact-request claim──▶ Pages
//
// API NOTE (resolved TODO B, 2026-06-20): McpAgent mandates the high-level McpServer, whose registerTool
// takes a Zod shape — but the app already emits JSON-Schema inputSchema (z.toJSONSchema). So we serve
// tools/list + tools/call on the UNDERLYING low-level server (this.server.server), which carries our
// JSON Schema through unchanged — exactly what the MCP wire protocol expects of a proxy. Pinned to
// agents@0.16.2 / @modelcontextprotocol/sdk@1.29.0.
//
// Verify-on-deploy: that registerCapabilities()+setRequestHandler() in init() take effect before the
// McpAgent connects its transport (standard McpAgent lifecycle; confirm on first Claude connection).

import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import OAuthProvider, { type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import {
  MCP_REQUEST_AUDIENCE,
  deriveMcpLogicalIdempotencyKey,
  digestMcpRequestBody,
  signMcpRequestClaim,
  type McpRequestPath
} from '../../../shared/utils/mcpRequestClaim'

interface Env {
  APP_BASE_URL: string
  MCP_INTERNAL_SECRET: string
  MCP_REQUEST_SIGNING_SECRET: string
  MCP_OBJECT: DurableObjectNamespace
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
}

/** base64url for round-tripping the OAuth request blob through the app login (URL-safe). */
const b64urlEncode = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlDecode = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

// Per-session props the OAuth layer puts on the token. userId is the validated XeroFlow user; scope is
// the granted OAuth scope (['mcp:read'] or ['mcp:read','mcp:write']) — forwarded to the app, which
// enforces mcp:write for write-class tools when MCP_REQUIRE_WRITE_SCOPE is on.
type Props = {
  userId: string
  scope: string[]
  godMode: boolean
  /** Minted once per OAuth grant and persisted in token props; combines with SDK requestId for retries. */
  oauthSessionId: string
}

// Matches the MCP `Tool` shape — the app's manifest endpoint returns this directly.
type ToolManifest = { name: string, description: string, inputSchema: Record<string, unknown> }

/** Call Pages with both independent service authentication and a one-time exact-request claim. */
async function appFetch(
  env: Env,
  path: McpRequestPath,
  body: unknown,
  props: Props,
  toolName?: string
): Promise<Response> {
  if (!env.MCP_REQUEST_SIGNING_SECRET) throw new Error('MCP request signing is not configured')
  const assertion = await signMcpRequestClaim({
    uid: props.userId,
    scope: props.scope,
    godMode: props.godMode,
    audience: MCP_REQUEST_AUDIENCE,
    method: 'POST',
    path,
    ...(path === '/api/internal/mcp/call' ? { toolName } : {}),
    bodyDigest: await digestMcpRequestBody(body)
  }, env.MCP_REQUEST_SIGNING_SECRET)
  return fetch(`${env.APP_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mcp-secret': env.MCP_INTERNAL_SECRET,
      'x-mcp-assertion': assertion,
    },
    body: JSON.stringify(body),
  })
}

export class XeroFlowMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: 'xeroflow', version: '1.0.1' })

  async init() {
    // props are populated by the OAuth layer; no validated user → expose nothing.
    const userId = this.props?.userId
    if (!userId) throw new Error('unauthenticated: no userId in session props')
    const props: Props = {
      userId,
      scope: this.props?.scope ?? ['mcp:read'],
      godMode: this.props?.godMode === true,
      oauthSessionId: this.props?.oauthSessionId ?? ''
    }
    if (!props.oauthSessionId) throw new Error('unauthenticated: reconnect to establish an OAuth session identity')

    // Serve tools/list + tools/call on the low-level server so our JSON-Schema inputSchema passes
    //    through verbatim (high-level registerTool would require Zod). Pure proxy — no schema parsing here.
    const low = this.server.server
    low.registerCapabilities({ tools: { listChanged: true } })
    low.oninitialized = () => {
      // Prompt hosts to discard any connector-side manifest cached before this session. tools/list
      // remains authoritative and fetches Pages fresh on every request.
      this.server.sendToolListChanged()
    }

    low.setRequestHandler(ListToolsRequestSchema, async () => {
      // A fresh Pages fetch means a fresh claim and fresh database authority check for every list.
      const res = await appFetch(this.env, '/api/internal/mcp/tools', { userId }, props)
      if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`)
      const { tools } = await res.json() as { tools: ToolManifest[] }
      return { tools }
    })

    low.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      const args = req.params.arguments ?? {}
      const operationBodyDigest = await digestMcpRequestBody({ tool: req.params.name, args })
      const idempotencyKey = await deriveMcpLogicalIdempotencyKey(
        props.oauthSessionId,
        extra.requestId,
        req.params.name,
        operationBodyDigest
      )
      const callBody = {
        userId,
        tool: req.params.name,
        args,
        idempotencyKey
      }
      const callRes = await appFetch(
        this.env,
        '/api/internal/mcp/call',
        callBody,
        props,
        req.params.name
      )
      const outcome = await callRes.json().catch(() => null) as {
        ok: boolean
        data?: unknown
        error?: string
        code?: string
        details?: Record<string, unknown>
      } | null
      if (!callRes.ok) {
        const retryable = callRes.status >= 500 || callRes.status === 429
        const error = {
          error: retryable ? 'mcp_upstream_unavailable' : 'mcp_request_rejected',
          message: retryable
            ? 'XeroFlow could not complete the tool call because its application service is temporarily unavailable.'
            : 'XeroFlow rejected the tool call before execution.',
          retryable,
          upstreamStatus: callRes.status,
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(error) }], isError: true }
      }
      if (!outcome?.ok) {
        const details = outcome.details && typeof outcome.details === 'object' ? outcome.details : {}
        const error = {
          error: typeof details.error === 'string'
            ? details.error
            : typeof outcome.code === 'string' ? outcome.code : 'tool_failed',
          message: typeof outcome.error === 'string' ? outcome.error : 'Tool failed.',
          ...details
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(error) }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(outcome.data) }] }
    })
  }
}

// OAuth identity handler (TODO A — reuse app identity). The provider implements /token + /register; this
// handles /authorize (delegate to the app login) and /callback (verify the app's signed assertion → grant).
const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // 1. MCP client starts OAuth → bounce the browser to the app to authenticate the user.
    if (url.pathname === '/authorize') {
      const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request)
      const appAuthorize = new URL('/api/mcp/authorize', env.APP_BASE_URL)
      appAuthorize.searchParams.set('redirect_uri', `${url.origin}/callback`)
      appAuthorize.searchParams.set('state', b64urlEncode(JSON.stringify(oauthReqInfo)))
      return Response.redirect(appAuthorize.toString(), 302)
    }

    // 2. App redirects back after login+consent with a signed assertion → resolve userId, grant.
    if (url.pathname === '/callback') {
      const state = url.searchParams.get('state') || ''
      const assertion = url.searchParams.get('assertion') || ''
      const res = await fetch(`${env.APP_BASE_URL}/api/internal/mcp/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mcp-secret': env.MCP_INTERNAL_SECRET },
        body: JSON.stringify({ assertion }),
      })
      if (!res.ok) return new Response('Authentication failed', { status: 401 })
      const { userId, scope, godMode } = await res.json() as {
        userId: string
        scope?: string[]
        godMode?: boolean
      }
      // Mint the token with exactly the scope the user consented to (read-only, or read + write).
      const granted = Array.isArray(scope) && scope.length ? scope : ['mcp:read']

      const oauthReqInfo = JSON.parse(b64urlDecode(state))
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId,
        scope: granted,
        metadata: {},
        props: {
          userId,
          scope: granted,
          godMode: godMode === true,
          oauthSessionId: crypto.randomUUID()
        },
      })
      return Response.redirect(redirectTo, 302)
    }

    return new Response('Not found', { status: 404 })
  },
}

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: XeroFlowMcpAgent.serve('/mcp'),
  defaultHandler: authHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: ['mcp:read', 'mcp:write'],
})
