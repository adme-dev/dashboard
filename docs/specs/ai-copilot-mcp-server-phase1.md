# Spec: MCP Server — Phase 1 (read-only expose layer)

**Status:** Design — implementation-ready
**Parent:** [ADR: MCP Interop](./ai-copilot-mcp-interop-adr.md) (Revision 2026-06-20 approved Phase 1)
**Related:** [Portal agent](./ai-copilot-portal-agent.md) (tenant isolation precedent), [Traffic controller](./ai-copilot-traffic-controller.md)
**Created:** 2026-06-20

---

## 1. What this is

A standalone remote **MCP server** that lets an authenticated XeroFlow user reach their **read-only** tools from an external MCP host (ChatGPT, Claude, Cursor) — to pull client/project/social/finance records and run analytics/Q&A inside their own assistant. It is a **thin transport adapter over the existing tool layer**, not a new agent: the same `registry`, the same `filterToolsForUser` RBAC, the same per-tool Zod schemas. **No writes in Phase 1** (those are [Phase 2](#9-out-of-scope-phase-2)).

**Non-goal:** replacing the in-app co-pilot. This is a *second front door* to the same tools for users who live in ChatGPT/Claude.

## 2. Architecture

```
External host (Claude/ChatGPT/Cursor)
   │  Streamable HTTP + OAuth 2.1 (per-user token, audience-bound)
   ▼
workers/mcp-server  (standalone Worker — NOT the Pages app)
   • McpAgent (Durable Object per session) + workers-oauth-provider
   • on connect: token → resolve XeroFlow user + role (+ optional clientScope)
   • tools = filterToolsForUser(registry, role).filter(t => !t.mutates)
   • tool call → run the SAME tool fn against XeroFlow data (read)
   ▼
Neon / app data (read paths only)
```

- **Standalone Worker** (`workers/mcp-server/`), because `McpAgent` is Durable-Object-backed and can't live inside the Pages function. It imports the tool layer from the app (shared package path or vendored build), so tool logic is never forked.
- **Streamable HTTP** transport (current standard); DO session state via `McpAgent`. DO free tier covers it.
- The server is an **OAuth 2.1 Resource Server** fronted by `workers-oauth-provider`.

## 3. Auth model (copied from the Salesforce/Heroku pattern + MCP spec)

1. **Per-user OAuth, every transaction under that user's own identity.** The MCP access token resolves to exactly one XeroFlow `user.id`; there are **no shared service accounts**. (Salesforce's "runs as the user, existing permissions auto-enforced" — the single most important lesson.)
2. **Dedicated scope** `mcp:read` (Phase 2 adds `mcp:write`). Distinct from any existing API scope; least-privilege, no wildcard.
3. **Audience-bound tokens (RFC 8707):** token carries this server's canonical URI as audience; the server **rejects** any token not issued for it, and **never forwards** the token downstream (no token passthrough — MCP spec MUST).
4. **The wire boundary enforces the same ceiling as in-app.** Tool exposure is computed server-side via `filterToolsForUser(registry, role)` — a tool the user can't call in-app is absent from their MCP toolset. RBAC is never trusted to the client.
5. **Tenant isolation:** for a *client/portal* token, set `ToolContext.clientScope` to that client id and serve `portalRegistry` (read-only subset) — identical to the [portal agent](./ai-copilot-portal-agent.md) tenant lock. Staff tokens carry no clientScope (full role-scoped read).
6. **IdP:** front with Cloudflare Access or the app's existing session/OAuth (decision in §10). PKCE mandatory; HTTPS-only; short-lived access tokens + refresh rotation.

## 4. Which tools are exposed (Phase 1)

```ts
const role = resolvedUser.role
const base = clientScope ? portalRegistry : registry
const tools = filterToolsForUser(base, role).filter(t => !t.mutates)   // read-only ceiling
// → toSdkTools(tools, ctx, seed) adapted to MCP tool definitions (name, description, inputSchema=Zod)
```

- Phase 1 ships the `!mutates` set only. Every such tool already declares a Zod `parameters` schema → emitted as MCP `inputSchema`.
- `returnsUntrusted` tools (free-text that could carry injected instructions) are flagged in their MCP description so the host treats output as data, not instructions.

## 5. Security (defensible production posture)

- **No token passthrough; audience validation; 401 on invalid/expired** (MCP spec MUSTs).
- **Prompt-injection / confused-deputy:** the external host is an *untrusted caller*. Validate every input against the Zod schema; never elevate scope from tool output; never act on instructions embedded in returned data.
- **SSRF:** any server-side URL fetch (OAuth metadata, asset URLs) enforces HTTPS + blocks private/reserved IPs (incl. `169.254.169.254`).
- **Audit:** every MCP tool call writes to the existing `ai_action_audit` trail (user, tool, args-digest, outcome) — same observability as in-app.
- **Annotations are hints, not controls** — `readOnlyHint` is advisory; Phase-1 read-only-ness is enforced by the `!mutates` filter server-side, not by annotation.
- **Rate-limiting** per user/token at the Worker edge.

## 6. Client onboarding (what the user actually does)

- **Claude (Pro/Max/Team/Enterprise) — pilot here first** (lowest friction, works on individual Pro): Settings → Connectors → add custom connector → our MCP URL → OAuth consent.
- **ChatGPT (Team/Business/Enterprise/Edu only):** an admin enables Developer Mode in Workspace Settings, then users add the connector. **⚠️ Not available on consumer Plus/Pro** — confirm the workspace plan before promising this path.
- **Cursor:** add via Settings → Tools & Integrations (OAuth handled automatically).

## 7. Build checklist

- [ ] `workers/mcp-server/` — `McpAgent` + `workers-oauth-provider`, Streamable HTTP, wrangler.toml (DO binding, routes).
- [ ] Token → user/role/clientScope resolver (reuse the app's session/JWT verification).
- [ ] MCP tool projection: `filterToolsForUser` → `!mutates` → MCP tool defs from Zod schemas.
- [ ] Per-call execution against read tool fns + `ai_action_audit` logging.
- [ ] OAuth: `mcp:read` scope, audience binding, PKCE, refresh rotation.
- [ ] Rate-limit + SSRF guards.
- [ ] Unit tests: RBAC projection (a low-role user sees fewer tools), tenant isolation (client token → only its data), write tools absent, audience rejection.
- [ ] Onboarding doc for staff (Claude first).

## 8. Acceptance (Phase 1)

- A staff user connects from Claude, authenticates, and can run read tools scoped to their role; a lower-privileged user sees a strictly smaller toolset.
- A client/portal token returns only that client's data (tenant-isolation test passes); no mutating tool is ever present.
- Wrong-audience / expired tokens are rejected (401). No token passthrough.
- Every call is audited. Zero new type errors; tests green.

## 9. Out of scope (Phase 2)

Mutating tools over MCP (submit brief, create project, **sign off**) via **elicitation** → mapped to the existing `riskTier`: `confirm` = single accept; **`rich_confirm` (e-sign) = mandatory server-enforced second round-trip** (the server keeps its own `requestState` and re-prompts; it never finalizes on the host's word alone). Separate spec + explicit sign-off; never auto-execute.

## 10. Open decisions (operator)

1. **Who is the Phase-1 user — staff or clients?** Staff (full role-scoped read, no clientScope) is the simpler, higher-value start; client/portal tokens (tenant-locked `portalRegistry`) can follow. Recommend **staff-first**.
2. **IdP:** Cloudflare Access vs the app's existing OAuth/session. Recommend reusing the app's identity so the MCP user == the in-app user 1:1.
3. **Pilot host:** **Claude Pro** (works today without workspace/admin) vs ChatGPT (needs Team/Business/Enterprise + admin). Recommend Claude-first.
