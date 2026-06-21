# mcp-server — deployment & go-live

Standalone Worker that exposes XeroFlow's **read-only** tools over MCP to ChatGPT / Claude / Cursor.
Thin proxy: it does OAuth + MCP transport, then calls the Pages app's `/api/internal/mcp/{tools,call}`
(the single, audited, RBAC-enforcing execution authority). Spec: `docs/specs/ai-copilot-mcp-server-phase1.md`.

## Status: SCAFFOLD — not yet live

Both integration points are now scaffolded + verified-to-compile. What remains is **infra config + a live
connection test** (no more app code).

- **(A) OAuth IdP — SCAFFOLDED (2026-06-20), reuse-app-identity.** Wired `@cloudflare/workers-oauth-provider@0.8.1`:
  the Worker is the MCP-facing OAuth server (`/token`, `/register` auto); `/authorize` bounces the browser to
  the app's `/api/mcp/authorize` (existing login), which mints a short-lived **HMAC-signed assertion** of the
  userId; the Worker's `/callback` posts it to `/api/internal/mcp/exchange` to resolve `userId`, then
  `completeAuthorization({ props:{userId}, scope:['mcp:read'] })`. Assertion sign/verify is single-sourced +
  unit-tested in `server/utils/ai/mcp/assertion.ts` (HMAC-SHA256, 120s TTL, fail-safe). Compiles clean
  against the real lib. **Remaining = config, not code:**
  - `wrangler kv namespace create OAUTH_KV` → put the id in `wrangler.toml`.
  - Set matching secrets on BOTH sides: `MCP_INTERNAL_SECRET`, `MCP_HANDSHAKE_SECRET` (Pages project + this
    Worker via `wrangler secret put`), and `MCP_WORKER_ORIGIN` (Pages project = this Worker's origin, the
    open-redirect guard).
  - **Refinement (optional):** add an explicit consent screen on `/api/mcp/authorize` before minting; the
    scaffold mints on confirmed login. And `/sign-in?redirect=` round-trip assumes that login route exists.

- **(B) Tool registration — DONE (2026-06-20).** Versions pinned (`agents@0.16.2`,
  `@modelcontextprotocol/sdk@1.29.0`) and the registration verified to **compile against the real SDK
  types**. Because McpAgent mandates the high-level `McpServer` (whose `registerTool` wants a Zod shape)
  but the app emits JSON-Schema `inputSchema`, the Worker serves `tools/list` + `tools/call` on the
  underlying low-level server (`this.server.server` + `setRequestHandler`), passing JSON Schema through
  as the wire protocol intends. One thing to confirm on the first live connection: that
  `registerCapabilities()` in `init()` takes effect before the transport connects (standard McpAgent
  lifecycle).

## Prerequisites

1. **App side already shipped** (slices 1+2): `server/utils/ai/mcp/project.ts` + `/api/internal/mcp/*`.
2. **On the Pages project**, set `MCP_SERVER_ENABLED=true` and `MCP_INTERNAL_SECRET=<random>` (prod env).
   The endpoints 503 until the flag is on and 401 without the matching secret.

## Deploy

```bash
# Deploy from a copy OUTSIDE the repo tree — the root .wrangler/deploy/config.json redirect breaks
# in-place sub-worker deploys (same gotcha as observe-cron).
REPO=/path/to/dashboard
rm -rf /tmp/mcp-server-deploy && cp -R "$REPO/workers/mcp-server" /tmp/mcp-server-deploy
cd /tmp/mcp-server-deploy && npm install
"$REPO/node_modules/.bin/wrangler" deploy

# Secret must match the Pages project's MCP_INTERNAL_SECRET:
printf '%s' "$MCP_INTERNAL_SECRET" | "$REPO/node_modules/.bin/wrangler" secret put MCP_INTERNAL_SECRET
# + any OAuth signing secrets per (A).
```

## Verify (pilot = Claude Pro — lowest friction)

1. In Claude → Settings → Connectors → add custom connector → `https://mcp-server.<acct>.workers.dev/mcp`.
2. Complete the OAuth consent (logs in as a XeroFlow user).
3. Confirm Claude lists **only read tools**, and **only the ones that user's role allows** (a lower-role
   user should see fewer). Run one (e.g. a client overview) and confirm data returns.
4. Confirm a write tool is **absent** and cannot be invoked (Phase-1 invariant; also enforced server-side).
5. Check `ai_action_audit` has a row per call (`payload.source = 'mcp'`).

ChatGPT works the same but needs a **Team/Business/Enterprise** workspace with Developer Mode enabled by an
admin — **not** consumer Plus/Pro. Cursor: Settings → Tools & Integrations → add the URL.

## Out of scope (Phase 2)

Writes over MCP (submit brief / create project / **sign off**) via MCP **elicitation** mapped to the
existing `riskTier`, with a mandatory server-enforced second confirm for `rich_confirm` (e-sign). Separate
spec + sign-off. The app guard (`executeReadOnlyTool`) hard-blocks writes until then.
