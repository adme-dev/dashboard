# ADR: MCP Interop for the Co-pilot

**Status:** Accepted (2026-06-19) · **REVISED 2026-06-20 — Phase-1 read-only MCP server APPROVED for build** (see Revision at the end). The original "don't bolt MCP onto the *internal in-process* loop" decision stands; what changed is that the *expose-layer* trigger this ADR named ("a concrete external consumer") fired — agency staff want to drive XeroFlow from ChatGPT/Claude/Cursor.
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md)
**Context:** Should we adopt MCP (Model Context Protocol) — Streamable HTTP transport + Durable Objects for session state, `@modelcontextprotocol/hono` middleware, or Cloudflare Agents SDK `McpAgent` — in the application?

## Decision

**Do NOT use MCP for the internal co-pilot now.** Keep native AI SDK tool-calling (the tool loop is in-process inside Nitro; tools are TypeScript functions). MCP is a transport for crossing a process/network boundary the internal agent does not have — adding it would introduce a hop, latency, and DO session-coordination for zero benefit.

**Keep the tool/executor registry MCP-ready** so a future MCP server is a thin transport adapter, not a rewrite.

## Rationale

- **Internal agent = in-process.** `runToolLoop` + `registry` (`toSdkTools`) + `executors` already give RBAC-filtered tool calling with propose→confirm. The model calls tools natively via the AI SDK. No transport needed.
- **MCP's value is directional and is a product decision, not an infra need:**
  - *MCP server* (expose XeroFlow tools to external clients — Claude Desktop, ChatGPT Workspace Agents, Cursor): valuable later, but competes with the native co-pilot and carries OAuth / per-user-token / RBAC-over-the-wire weight. Defer until there's a concrete demand (e.g. a customer wants their own agent to reach their portal data).
  - *MCP client* (consume third-party MCP servers as tools): marginal — our value is internal data. Adopt opportunistically only if a specific external tool is needed.
- **The WS-B registry is the right seam.** When we do expose, the MCP server is an adapter over the *same* `registry` + `executors`, enforcing the *same* `filterToolsForUser` RBAC + `clientScope` + propose→confirm server-side. The model-facing protocol changes; the authorization + execution core does not.

## When we DO expose MCP (future)

- Use **Cloudflare Agents SDK `McpAgent`** (wraps Streamable HTTP + Durable-Object session state) — least friction since we're already on Workers/Pages. `@modelcontextprotocol/hono` is the alternative if we want the raw SDK + our own session DO.
- **Per-user OAuth**, tokens scoped to the user's RBAC; the wire boundary must enforce the same ceiling as the in-app agent (a tool the user can't call in-app must be unreachable over MCP).
- **Tenant isolation holds over the wire:** a portal MCP token is `clientScope`-locked exactly like the [portal agent](./ai-copilot-portal-agent.md).
- Reuse `registry`/`executors` — do not fork tool logic into the MCP layer.

## Consequences

- No new dependency or DO today; the co-pilot ships on native tool-calling.
- A small, explicit "expose layer" item enters the backlog for if/when external interop is demanded.
- The registry abstraction (already built in WS-B) is the contract that keeps MCP a future adapter.

### Sources
- [Cloudflare Agents SDK — McpAgent](https://developers.cloudflare.com/agents/) · [Model Context Protocol](https://modelcontextprotocol.io/) · [OpenAI Workspace Agents (connector model, comparison)](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business)

---

## Revision (2026-06-20) — Phase 1 APPROVED: read-only MCP server

**Trigger fired.** This ADR deferred the MCP *server* "until there's a concrete demand." There now is one: agency **staff** want to drive XeroFlow from inside **ChatGPT / Claude / Cursor** — read records + run client analytics now, and later perform human-approved writes (submit a brief, create a project, sign off). That is precisely the expose-layer case, so we build it — as the **thin adapter over the existing `registry` + `executors` + RBAC** this ADR always reserved, never a fork.

### What did NOT change
The internal co-pilot stays on native in-process tool-calling. We are **adding a second front door** (MCP) to the *same* tools, not rebuilding the agent. A tool unreachable in-app for a user stays unreachable over MCP.

### Decision (revised)
1. **Build a standalone `McpAgent` Worker** (`workers/mcp-server/`) — **not** in the Pages app (the DO-backed agent must be its own Worker). Streamable HTTP transport; `workers-oauth-provider` for auth. Confirmed against current Cloudflare docs (2026-06).
2. **Phase 1 = READ-ONLY.** Expose only `!mutates` tools from `registry` (and, for client tokens, `portalRegistry`). ~80% of the value (analytics / Q&A / record pull) at near-zero write risk. Proves OAuth + per-user RBAC + tenant isolation end-to-end.
3. **Phase 2 = gated writes** (separate spec/sign-off) — mutating tools via MCP **elicitation** mapped to the existing `riskTier` (`confirm` / `rich_confirm`) propose→confirm, with a mandatory server-enforced second round-trip for `rich_confirm` (e-sign). Held until Phase 1 is proven.

### Evidence backing the revision (R&D 2026-06-20)
- **Salesforce precedent** validates the exact model: they *host* MCP servers themselves, gate with **OAuth + PKCE + a dedicated `mcp_api` scope**, run every transaction **under the authenticated user's own identity with the org's existing permission model auto-enforced** (no service accounts), via an admin tool registry, with HITL on writes. We copy this shape. ([Salesforce hosted MCP GA](https://developer.salesforce.com/blogs/2026/04/salesforce-hosted-mcp-servers-are-now-generally-available))
- **MCP Authorization spec (2025-06-18):** server = OAuth 2.1 Resource Server; **audience-bind tokens (RFC 8707)**, reject wrong-audience, 401 on invalid; PRM discovery (RFC 9728); **token passthrough forbidden**; PKCE mandatory; least-privilege scopes. ([spec/authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), [spec/security](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices))
- **Client support / commercial gate:** ChatGPT custom remote connectors are **Team/Business/Enterprise/Edu only** (admin-enabled Developer Mode — **not** consumer Plus/Pro); **Claude** supports custom connectors on **Pro/Max/Team/Enterprise** (lowest-friction pilot); **Cursor** supports remote MCP + OAuth. → **Pilot on Claude Pro first; ChatGPT requires confirming a workspace plan + admin.** ([OpenAI dev mode](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [Claude custom connectors](https://support.claude.com/en/articles/11503834-build-custom-connectors-via-remote-mcp-servers))
- **Tool annotations are advisory only** — never a security control; enforcement is server-side. ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/))

Full Phase-1 design: [MCP server Phase 1](./ai-copilot-mcp-server-phase1.md).
