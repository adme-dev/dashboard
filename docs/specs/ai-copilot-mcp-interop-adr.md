# ADR: MCP Interop for the Co-pilot

**Status:** Accepted (2026-06-19)
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
