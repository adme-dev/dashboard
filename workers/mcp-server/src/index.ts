// workers/mcp-server/src/index.ts
//
// MCP Server Phase 1 — SCAFFOLD (mcp-server-phase1 spec §2-§5).
//
// ⚠️ This is a deploy-verified scaffold, not a unit-tested module. The security-critical logic
// (RBAC projection + read-only/write-block guard) lives and is fully tested in the Pages app at
// server/utils/ai/mcp/project.ts and is reached over HTTP via /api/internal/mcp/{tools,call}. This
// Worker is the thin transport: OAuth + MCP protocol + proxy. The two integration points that need a
// live check / your decision are marked TODO:
//   (A) OAuth IdP wiring — how the user authenticates and how their XeroFlow userId lands in token props
//   (B) the exact McpAgent/SDK tool-registration call for the installed package versions
//
// Architecture (thin proxy — no tool logic or DB here):
//   external host ──OAuth──▶ this Worker ──x-mcp-secret + {userId}──▶ Pages /api/internal/mcp/*
//
// Deploy: see DEPLOYMENT.md. DORMANT until MCP_SERVER_ENABLED=true on the Pages app + OAuth wired.

import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

interface Env {
  APP_BASE_URL: string
  MCP_INTERNAL_SECRET: string
  MCP_OBJECT: DurableObjectNamespace
}

// Per-session props the OAuth layer puts on the token (see (A)). userId is the validated XeroFlow user.
type Props = { userId: string }

type ToolManifest = { name: string, description: string, inputSchema: Record<string, unknown> }

/** Call the Pages app's internal MCP endpoints (the single execution authority). */
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
    const userId = this.props.userId

    // 1. Fetch the read-only toolset this user may call (RBAC enforced server-side in the app).
    const res = await appFetch(this.env, '/api/internal/mcp/tools', { userId })
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`)
    const { tools } = await res.json() as { tools: ToolManifest[] }

    // 2. Register each as an MCP tool whose handler proxies execution back to the app.
    //    TODO (B): confirm the registration signature for the installed @modelcontextprotocol/sdk +
    //    agents versions. The manifest already carries JSON-Schema inputSchema (pass-through), so this
    //    Worker never needs to understand the schemas — it's a pure proxy.
    for (const t of tools) {
      this.server.registerTool(
        t.name,
        { description: t.description, inputSchema: t.inputSchema as never },
        async (args: unknown) => {
          const callRes = await appFetch(this.env, '/api/internal/mcp/call', { userId, tool: t.name, args })
          const outcome = await callRes.json() as { ok: boolean, data?: unknown, error?: string }
          if (!outcome.ok) {
            return { content: [{ type: 'text', text: `Error: ${outcome.error ?? 'tool failed'}` }], isError: true }
          }
          return { content: [{ type: 'text', text: JSON.stringify(outcome.data) }] }
        },
      )
    }
  }
}

// TODO (A): wrap with the OAuth provider so `props.userId` is the validated XeroFlow user.
//   Recommended (per ADR + research): @cloudflare/workers-oauth-provider fronting the app's existing
//   identity, issuing audience-bound tokens with the `mcp:read` scope. Until wired, this default export
//   serves the MCP transport WITHOUT auth and MUST NOT be deployed publicly.
//
//   import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
//   export default new OAuthProvider({
//     apiHandler: XeroFlowMcpAgent.serve('/mcp'),
//     // authorize/token/register endpoints → app identity; set props.userId on success
//     ...
//   })
export default XeroFlowMcpAgent.serve('/mcp')
