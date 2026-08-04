# mcp-server — deployment & go-live

Standalone Worker that exposes XeroFlow's governed tools over MCP to ChatGPT / Claude / Cursor.
Thin proxy: it does OAuth + MCP transport, then calls the Pages app's `/api/internal/mcp/{tools,call}`
(the single authenticated, tenant-isolated, audited execution authority). Ordinary users retain scoped
RBAC and proposal/confirmation governance; a freshly revalidated active owner can execute registered
writes directly without a second confirmation.

## Status: SCAFFOLD — not yet live

The OAuth transport and exact-request signing path are implemented and verified to compile. Production
activation remains coordinated with the matching Pages owner projection/execution release, secret setup,
and a live connection test.

- **(A) OAuth IdP — SCAFFOLDED (2026-06-20), reuse-app-identity.** Wired `@cloudflare/workers-oauth-provider@0.8.1`:
  the Worker is the MCP-facing OAuth server (`/token`, `/register` auto); `/authorize` bounces the browser to
  the app's `/api/mcp/authorize` (existing login), which mints a short-lived **HMAC-signed assertion** of the
  userId; the Worker's `/callback` posts it to `/api/internal/mcp/exchange` to resolve `userId`, then
  `completeAuthorization({ props:{userId,scope,godMode,oauthSessionId} })`. The owner bit comes only from
  Pages after fresh database resolution; the OAuth client cannot supply it. Assertion sign/verify is single-sourced +
  unit-tested in `server/utils/ai/mcp/assertion.ts` (HMAC-SHA256, 120s TTL, fail-safe). Compiles clean
  against the real lib. **Remaining = config, not code:**
  - `wrangler kv namespace create OAUTH_KV` → put the id in `wrangler.toml`.
  - Set matching `MCP_INTERNAL_SECRET` and `MCP_REQUEST_SIGNING_SECRET` secrets on BOTH the Pages project
    and this Worker. Set `MCP_HANDSHAKE_SECRET` and `MCP_WORKER_ORIGIN` on Pages; the latter is this
    Worker's origin and protects the OAuth redirect.
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
2. **On the Pages project**, set `MCP_SERVER_ENABLED=true`, `MCP_INTERNAL_SECRET`,
   `MCP_REQUEST_SIGNING_SECRET`, `GOD_MODE_INTERNAL_EXECUTION_SECRET`, and `MCP_HANDSHAKE_SECRET` in
   Production environment secrets. `GOD_MODE_INTERNAL_EXECUTION_SECRET` is Pages-only; never configure it
   on this Worker.
   Internal tools/call requests require both the service secret and a signed one-time request claim.

## Deploy

Initial activation requires a coordinated maintenance window; it is not availability-safe:

1. Announce the outage and stop accepting MCP traffic.
2. Generate the request-signing and Pages-only internal-execution secrets through an approved
   secret-management path.
3. Set the identical `MCP_REQUEST_SIGNING_SECRET` on the existing Pages project and Worker, and set
   `GOD_MODE_INTERNAL_EXECUTION_SECRET` only on Pages, before either enforcing release is deployed. Do not
   print or commit either value.
4. Deploy the Worker release first so every new list/call emits a signed assertion while the old Pages
   release still accepts its existing request shape. Existing token props without `oauthSessionId` reject
   and fail closed at this point.
5. Force all existing OAuth connectors to reconnect at Worker activation, before traffic reopens. Verify
   a safe read only from a reconnected session, then deploy Pages so signed assertions become mandatory.
6. Verify owner and ordinary safe reads, then reopen MCP traffic.

This ordering avoids enabling Pages enforcement while the Worker is still unable to sign requests, but
it does not preserve existing connector availability because legacy OAuth props have no stable session
identity. Do not perform the Worker-first step outside the maintenance window.

```bash
# Deploy from a copy OUTSIDE the repo tree — the root .wrangler/deploy/config.json redirect breaks
# in-place sub-worker deploys (same gotcha as observe-cron).
REPO=/path/to/dashboard
MCP_DEPLOY_DIR=$(mktemp -d /private/tmp/xeroflow-mcp-deploy.XXXXXX)
mkdir -p "$MCP_DEPLOY_DIR/workers"
cp -R "$REPO/workers/mcp-server" "$MCP_DEPLOY_DIR/workers/mcp-server"
cp -R "$REPO/shared" "$MCP_DEPLOY_DIR/shared"
npm --prefix "$MCP_DEPLOY_DIR/workers/mcp-server" install --legacy-peer-deps

# Before deploying: prompts for values. These must already match the corresponding Pages secrets.
"$MCP_DEPLOY_DIR/workers/mcp-server/node_modules/.bin/wrangler" secret put MCP_INTERNAL_SECRET \
  --cwd "$MCP_DEPLOY_DIR/workers/mcp-server"
"$MCP_DEPLOY_DIR/workers/mcp-server/node_modules/.bin/wrangler" secret put MCP_REQUEST_SIGNING_SECRET \
  --cwd "$MCP_DEPLOY_DIR/workers/mcp-server"

# Deploy the signing Worker first. Deploy Pages only after the safe-read verification succeeds.
"$MCP_DEPLOY_DIR/workers/mcp-server/node_modules/.bin/wrangler" deploy \
  --cwd "$MCP_DEPLOY_DIR/workers/mcp-server"
```

On Pages, set/rotate the matching Worker/Pages secrets plus the Pages-only internal execution secret in
Workers & Pages → `agency-dashboard` → Settings → Environment Variables → Production. Never place a
secret value in `wrangler.toml`, a commit, or logs.

## Verify (pilot = Claude Pro — lowest friction)

1. In Claude → Settings → Connectors → add custom connector → `https://mcp-server.<acct>.workers.dev/mcp`.
2. Complete the OAuth consent (logs in as a XeroFlow user).
3. For an ordinary user, confirm the catalog respects role, enabled suites, and consented scopes. Confirm
   writes continue through proposal plus `confirm_action` where that suite requires it.
4. For an active owner, confirm the server revalidates current owner status, returns registered tools, and
   executes a representative write directly without `confirm_action`. Downgrade the test owner and confirm
   the next list/call is governed or rejected.
5. Check the MCP and God-mode audit records. They must contain bounded metadata only—never the service
   secret, signed claim, request body, or OAuth assertion.

ChatGPT works the same but needs a **Team/Business/Enterprise** workspace with Developer Mode enabled by an
admin — **not** consumer Plus/Pro. Cursor: Settings → Tools & Integrations → add the URL.

## Request-authority rotation

Single-key verification does not support zero-downtime rotation. Schedule a coordinated maintenance
window, stop accepting MCP traffic, set the same new `MCP_REQUEST_SIGNING_SECRET` on both Pages and the
Worker, deploy/restart both sides, then resume traffic and verify a safe read. Any request that crosses a
key mismatch fails closed; do not describe that interval as available service. `MCP_INTERNAL_SECRET`
remains a separate required control. Existing OAuth sessions whose token predates the persisted
`oauthSessionId` property must reconnect before verification; include that reconnect in the maintenance
notice.
