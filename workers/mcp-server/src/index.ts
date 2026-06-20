// workers/mcp-server/src/index.ts
//
// MCP Server Phase 1 — SCAFFOLD (mcp-server-phase1 spec §2-§5).
//
// ⚠️ Deploy-verified scaffold, not a unit-tested module. The security-critical logic (RBAC projection +
// read-only/write-block guard) lives and is fully tested in the Pages app at server/utils/ai/mcp/project.ts
// and is reached over HTTP via /api/internal/mcp/{tools,call}. This Worker is the thin transport: MCP
// protocol + (TODO A) OAuth + proxy. No tool logic or DB here.
//
// Architecture (thin proxy):
//   external host ──OAuth──▶ this Worker ──x-mcp-secret + {userId}──▶ Pages /api/internal/mcp/*
//
// API NOTE (resolved TODO B, 2026-06-20): McpAgent mandates the high-level McpServer, whose registerTool
// takes a Zod shape — but the app already emits JSON-Schema inputSchema (z.toJSONSchema). So we serve
// tools/list + tools/call on the UNDERLYING low-level server (this.server.server), which carries our
// JSON Schema through unchanged — exactly what the MCP wire protocol expects of a proxy. Pinned to
// agents@0.16.2 / @modelcontextprotocol/sdk@1.29.0.
//
// Remaining: TODO (A) OAuth IdP wiring (see DEPLOYMENT.md) — until done, do NOT deploy publicly.
// Verify-on-deploy: that registerCapabilities()+setRequestHandler() in init() take effect before the
// McpAgent connects its transport (standard McpAgent lifecycle; confirm on first Claude connection).

import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

interface Env {
  APP_BASE_URL: string
  MCP_INTERNAL_SECRET: string
  MCP_OBJECT: DurableObjectNamespace
}

// Per-session props the OAuth layer puts on the token (TODO A). userId is the validated XeroFlow user.
type Props = { userId: string }

// Matches the MCP `Tool` shape — the app's manifest endpoint returns this directly.
type ToolManifest = { name: string, description: string, inputSchema: Record<string, unknown> }

/** Call the Pages app's internal MCP endpoints (the single, audited, RBAC-enforcing execution authority). */
async function appFetch(env: Env, path: string, body: unknown): Promise<Response> {
  return fetch(`${env.APP_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mcp-secret': env.MCP_INTERNAL_SECRET },
    body: JSON.stringify(body),
  })
}

export class XeroFlowMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: 'xeroflow', version: '1.0.0' })

  async init() {
    // props are populated by the OAuth layer (TODO A); no validated user → expose nothing.
    const userId = this.props?.userId
    if (!userId) throw new Error('unauthenticated: no userId in session props')

    // 1. Fetch the read-only toolset this user may call (RBAC enforced server-side in the app).
    const res = await appFetch(this.env, '/api/internal/mcp/tools', { userId })
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`)
    const { tools } = await res.json() as { tools: ToolManifest[] }

    // 2. Serve tools/list + tools/call on the low-level server so our JSON-Schema inputSchema passes
    //    through verbatim (high-level registerTool would require Zod). Pure proxy — no schema parsing here.
    const low = this.server.server
    low.registerCapabilities({ tools: {} })

    low.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

    low.setRequestHandler(CallToolRequestSchema, async (req) => {
      const callRes = await appFetch(this.env, '/api/internal/mcp/call', {
        userId,
        tool: req.params.name,
        args: req.params.arguments ?? {},
      })
      const outcome = await callRes.json() as { ok: boolean, data?: unknown, error?: string }
      if (!outcome.ok) {
        return { content: [{ type: 'text' as const, text: `Error: ${outcome.error ?? 'tool failed'}` }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(outcome.data) }] }
    })
  }
}

// TODO (A): wrap with @cloudflare/workers-oauth-provider so `props.userId` is the validated XeroFlow user
// (reuse the app's identity; audience-bound `mcp:read` token). Until wired, this serves the MCP transport
// WITHOUT auth and MUST NOT be deployed publicly. See DEPLOYMENT.md §OAuth.
export default XeroFlowMcpAgent.serve('/mcp')
