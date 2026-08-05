# mcp-server — deployment & go-live

Standalone Worker that exposes XeroFlow's governed tools over MCP to ChatGPT / Claude / Cursor.
Thin proxy: it does OAuth + MCP transport, then calls the Pages app's `/api/internal/mcp/{tools,call}`
(the single authenticated, tenant-isolated, audited execution authority). Ordinary users retain scoped
RBAC and proposal/confirmation governance; a freshly revalidated active owner can execute registered
writes directly without a second confirmation.

## Status: live production rollout — 2026-08-05

The standalone MCP Worker is live in production. OAuth, explicit consent, Durable Object session state,
exact-request signing and tool registration are active against the canonical authenticated application
origin `https://app.xeroflow.io`.

- MCP Worker version: `fa7bb8d4-cdf8-4569-bcb8-40b2c63fe44e`.
- Pages cron Worker version: `bf5e9bc2-d558-473a-97c1-fb0c71e719aa`.
- Successful guarded Pages deployment: `cccdb9f1`.
- The final read-bridge Pages fix is being released through the **latest guarded production deployment**;
  do not record a deployment ID until Cloudflare returns and verifies it.

The Worker is the MCP-facing OAuth server (`/token` and `/register`); `/authorize` returns the browser to
the canonical app login and explicit consent screen. Pages mints a short-lived HMAC-signed identity
assertion, freshly resolves the database user and owner authority, and returns bounded
`{ userId, scope, godMode, oauthSessionId }` props. The OAuth client cannot assert God mode. Production
OAuth granted `mcp:read mcp:write`, negotiated MCP protocol `2025-03-26`, and exposed 62 registered tools
across Finance, Marketing, Social, Banners, Video and the wider platform.

Production configuration is present. Verify by name only; never read, print or commit values:

- Standalone Worker: `MCP_INTERNAL_SECRET`, `MCP_REQUEST_SIGNING_SECRET`, `OAUTH_KV`, `MCP_OBJECT`, and
  `APP_BASE_URL=https://app.xeroflow.io`.
- Pages: `MCP_SERVER_ENABLED`, `MCP_INTERNAL_SECRET`, `MCP_REQUEST_SIGNING_SECRET`,
  `MCP_HANDSHAKE_SECRET`, `MCP_WORKER_ORIGIN`, and `GOD_MODE_INTERNAL_EXECUTION_SECRET`.
- `GOD_MODE_INTERNAL_EXECUTION_SECRET` remains Pages-only and must never be added to this Worker.

The first safe Finance read successfully reached the live tool catalog but exposed a Pages read-bridge
defect. Commit `0a5a4a89` fixes that defect. Final live Finance-read success remains pending until the
latest guarded production deployment completes and the same bounded read is repeated.

## Prerequisites

1. The app projection and execution authority is deployed from `server/utils/ai/mcp/project.ts` and
   `/api/internal/mcp/*`.
2. Before any redeploy, confirm the production configuration names above still exist on their exact
   runtimes. Do not retrieve secret values. Internal tools/call requests require both the service secret
   and a signed one-time request claim.

## Redeploy or rotate

The initial activation on 2026-08-05 required a coordinated maintenance window. All existing OAuth
connectors had to reconnect at Worker activation, before traffic reopened; legacy token props without
`oauthSessionId` reject and fail closed. Initial activation was not availability-safe. Preserve that
outage model for any future signing or OAuth-props migration.

Any release that changes request signing or OAuth session props requires a coordinated maintenance
window; it is not availability-safe:

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

# Rotation only: prompts for values. Skip these commands for an ordinary code-only redeploy.
# When rotating, the values must match the corresponding Pages secrets.
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

## Production evidence and remaining verification

Verified on 2026-08-05:

1. Paul resolves to exactly one active owner, sees the live `God mode active` UI, and receives HTTP 200
   from governance readiness.
2. Clara resolves to exactly one active owner in the database. No browser session was impersonated for
   Clara, so her UI and connector smoke remain unverified.
3. Live OAuth completed with `mcp:read mcp:write`; MCP protocol `2025-03-26` negotiated successfully.
4. Tool discovery returned 62 registered tools spanning Finance, Marketing, Social, Banners and Video.
5. The first safe Finance read exposed the read-bridge defect now fixed by `0a5a4a89`. Repeat that read
   after the latest guarded production deployment; do not mark the execution path complete until it
   succeeds and its bounded audit evidence is verified.

For subsequent verification, an ordinary user must retain role, suite, scope and confirmation governance.
A freshly revalidated active owner may execute registered capabilities directly, but authentication,
tenant/client/entity isolation, audit, emergency disable and provider boundaries remain enforced. Never
use an irreversible Finance or publishing operation as a smoke test.

Client setup remains: add the custom Worker `/mcp` connector, complete app login and explicit OAuth
consent, then request only the scopes required. ChatGPT requires an eligible managed workspace with
Developer Mode enabled by an administrator. Cursor uses Settings → Tools & Integrations.

## Request-authority rotation

Single-key verification does not support zero-downtime rotation. Schedule a coordinated maintenance
window, stop accepting MCP traffic, set the same new `MCP_REQUEST_SIGNING_SECRET` on both Pages and the
Worker, deploy/restart both sides, then resume traffic and verify a safe read. Any request that crosses a
key mismatch fails closed; do not describe that interval as available service. `MCP_INTERNAL_SECRET`
remains a separate required control. Existing OAuth sessions whose token predates the persisted
`oauthSessionId` property must reconnect before verification; include that reconnect in the maintenance
notice.
