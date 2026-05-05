# P6 — XeroFlow MCP Server (Sketch)

**Status:** Exploratory — not committed (high-priority candidate; can ship in parallel with P2/P3)
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md) — adjacent initiative, not part of the ad-spend-page sequence
**Date:** 2026-05-04
**Trigger:** Meta launched their Ads MCP server April 29, 2026; Perplexity / Claude Desktop / ChatGPT have all converged on standard remote-MCP-with-OAuth UX. The pattern is now mainstream.

## Vision

Expose XeroFlow as a remote MCP server (`mcp.adme.net.au/agency` — exact host TBD) so agency staff can query and act on agency data from any AI tool that speaks MCP — Claude Desktop, Perplexity, ChatGPT, Cursor, our own in-app chat (P4). The dashboard remains the surface for visual work (boards, charts, briefs); the MCP becomes the surface for conversational work.

## Why this matters

XeroFlow's data layer is rich (cross-platform spend, Xero bank-charges, briefs, clients, anomalies, EOM invoicing, time tracking, projects) and has no equivalent surface today besides the web UI. By exposing it as an MCP server, three things become possible:

1. **Reachability** — every AI tool the team uses becomes a XeroFlow consumer. Staff don't need to log into the dashboard for things AI can answer.
2. **Composability** — agency staff can ask "summarise our Frankston KIA Q1 performance and draft a brief for spring" — the AI calls our MCP for the data + Meta's MCP for live ad metrics + the AI's own model for the writing. Cross-tool reasoning, single conversation.
3. **Future-proofing** — as new AI surfaces emerge, we don't build per-surface integrations. They all speak MCP.

## Likely shape

### Server endpoint
- `https://mcp.adme.net.au/agency/sse` (SSE transport) or `/mcp` (Streamable HTTP) — likely both
- Implemented as a separate Cloudflare Worker (not the Pages app) for SSE-stream longevity beyond a single request
- Uses `@modelcontextprotocol/sdk` for protocol layer

### OAuth with discovery
- Publishes `/.well-known/oauth-authorization-server` so MCP clients auto-discover endpoints (matches the pattern Perplexity / Claude Desktop / ChatGPT all use)
- Reuses existing XeroFlow auth: `team_members`, `user_sessions`, `user_role`, `custom_role_id`
- Each staff member OAuths once per AI client (Perplexity, Claude Desktop, in-app chat) — same backend tokens
- Scopes: `spend:read`, `spend:write`, `clients:read`, `briefs:read`, `briefs:write`, `xero:read`, `admin:*`

### Tool taxonomy v1 — read-only

| Tool | Inputs | RBAC |
|------|--------|------|
| `get_spend_summary` | period, platform?, client_id? | `canAccessMediaBuying` |
| `get_client_pacing` | client_id, period? | `canAccessMediaBuying` |
| `get_bank_charges` | period | `canAccessFinance` |
| `get_pnl` | period?, group_by? | `canAccessFinance` |
| `get_executive_summary` | period | `canAccessReports` |
| `get_anomalies` | period?, severity? | `canAccessFinance` |
| `list_clients` | filter? | `canAccessClients` |
| `search_clients` | query | `canAccessClients` |
| `get_client` | client_id | `canAccessClients` |
| `list_briefs` | filter? | `canAccessClients` |
| `search_briefs` | query | `canAccessClients` |
| `get_brief` | brief_id | `canAccessClients` |
| `get_invoice` | invoice_id | `canAccessInvoices` |
| `list_invoices` | period?, status? | `canAccessInvoices` |
| `get_connection_health` | platform? | `canAccessMediaBuying` |
| `get_team_member` | id_or_email | any |

### Tool taxonomy v2 — write tools (deferred to a v2)

- `update_budget(client_id, platform, period, budget)` — needs `canWrite` + audit log
- `create_brief(client_id, title, fields)` — needs brief-write perm
- `approve_brief(brief_id)` — needs approver perm
- `acknowledge_anomaly(anomaly_id)` — low-risk write
- `kick_off_sync(platform)` — fires the existing fire-and-forget sync-spend endpoint
- `update_client_mapping(connection_id, mappings)` — admin-only

Each write tool needs explicit safety thinking — RBAC plumbing, idempotency, audit logging.

## Auth + RBAC integration

- MCP server validates the user's OAuth token against the existing `user_sessions` table
- Each tool call goes through the existing `requireRole()` / `requireWriteAccess()` middleware (extract into a callable helper that takes (userId, perm) → boolean instead of the current event-based form)
- All write calls land in an `audit_log` row with a `source: 'mcp'` tag so AI-initiated changes are auditable separately from human-initiated ones
- Per-user rate limits (e.g. 100 tool calls per minute) prevent runaway agents from spamming Xero/Meta APIs

## Open questions

- **Server hosting** — Cloudflare Workers (SSE-friendly, ops parity with the rest) vs. dedicated Node service. Workers preferred unless SSE on Workers turns out to be flaky.
- **Tool granularity** — 10 broad tools or 30 narrow ones? Narrower is more discoverable for the AI (less ambiguity per tool) but more API surface to maintain. Lean narrow.
- **Streaming results** — a year of `get_spend_summary` could return a lot. Paginate or stream? MCP supports both.
- **Schema descriptions** — tool descriptions are what the AI reads to decide whether/how to call them. Quality of descriptions = quality of agent decisions. Worth investing real writing time, not throwaway docstrings.
- **Beta gating** — open to all staff day 1, or admins only? OAuth scope-control gives us a knob; default conservative.
- **Cross-MCP context** — when our MCP returns a `client_id`, can a downstream AI tool call (e.g. Meta's MCP) use it? Probably not directly — Meta uses its own ad-account-id space. Cross-MCP joining is the AI's job; we just need stable IDs.

## Dependencies

- **Upstream**: none — can ship independently of P2/P3/P4/P5
- **Downstream**: P4 (in-app AI chat) becomes much smaller once P6 ships; revised P4 sketch reflects this

## Decision point

Decide whether to commit after:
- **Personal validation** — install Meta's MCP in Claude Desktop and use it for a real ad-ops task. Gauges what "good MCP UX" actually feels like before building one
- **Confirm AI tool of choice** — Perplexity vs. Claude Desktop vs. ChatGPT? Affects which transport (SSE vs. Streamable HTTP) we prioritize
- **Scope a write-tool RBAC review** — someone trustworthy on the safety side reviews each write tool's blast radius

## Rough effort estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| 6.0 | Server scaffold + OAuth-with-discovery + 1 read tool end-to-end | 3 days |
| 6.1 | Read-only tool taxonomy (~16 tools) | 1 week |
| 6.2 | Internal documentation + per-AI-client setup guides | 2 days |
| 6.3 | Write tools v2 (separate deploy after v1 has run for 2 weeks) | 1 week |
| **v1 total** | Read-only end-to-end | **~2 weeks** |

## Why this could outrank P4

P4 (in-app AI chat) is one consumer of MCP servers. P6 makes us *every other AI tool's* consumer too — Perplexity, Claude Desktop, ChatGPT users all become XeroFlow users. The leverage ratio is much higher per dev-week. Worth running ahead of P4 if resources allow.

## Source material

- Meta Ads AI Connectors launch (2026-04-29): mcp.facebook.com/ads, MCP server + CLI, full read-and-write at launch
- Perplexity Custom Remote Connectors help article (2026-03-04): paste URL → OAuth → done; SSE + Streamable HTTP transports; OAuth discovery via `/.well-known/oauth-authorization-server`
- Project intel: existing `useAiChat`, Anthropic SDK in stack, Cloudflare Workers infrastructure for separate-worker pattern (precedent: leads-delivery-worker, ai-agent-worker, email-worker)
