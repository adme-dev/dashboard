# Standalone email-design Nitro bundle spike

## Scope and owned files

Created only in `workers/email-design-spike/`:

- `nitro.config.ts`
- `package.json`
- `README.md`
- `.gitignore` (ignores generated `.nitro/` and `dist/`)

No canonical route, auth, permission, database, design, renderer, native Stage A, dashboard, deployment, or hosting source was edited. The generated artifact remains local and ignored for parent inspection.

## Configuration and bundle

Built successfully with exact Node `24.18.0` and installed Nitro `2.13.4`, preset `cloudflare_module`, compatibility date `2024-12-01`, and no dependency installation or secret loading.

The configuration:

- Uses the spike directory as `srcDir`, with no repository server scan and four absolute handler entries only:
  - `GET /api/email/design/drafts/:id`
  - `PATCH /api/email/design/drafts/:id`
  - `PATCH /api/email/design/drafts/:id/metadata`
  - `POST /api/email/design/drafts/initialize`
- Aliases `~~` to the repository root and directly imports canonical route/auth/db/design/renderer modules plus `server/plugins/database-connections.ts`.
- Enables `experimental.asyncContext` and Cloudflare node compatibility, disables source maps, and bundles the service graph except optional `pg-native`.
- Disables filesystem autoimport scans. TypeScript-aware presets supply only the implicit Nitro plugin/context symbols and h3 symbols used by this graph.

The first Rollup-injection attempt was rejected because its parser could not parse canonical TypeScript. The final build uses Nitro's TypeScript-aware autoimports and completes without those warnings.

## Actual artifact sizes

Gzip values use Node zlib `Z_BEST_COMPRESSION` on each file.

| File | Raw bytes | Gzip bytes |
|---|---:|---:|
| `dist/server/index.mjs` | 458,839 | 133,454 |
| `dist/nitro.json` | 405 | 239 |
| `dist/package.json` | 53 | 71 |
| `dist/package-lock.json` | 26 | 46 |
| `dist/public/_headers` | 0 | 20 |
| **Total** | **459,323** | **133,830** |

Nitro's own rounded report was 459 kB / 133 kB gzip. No Wrangler configuration was generated; transport and binding configuration remain outside this spike.

## Static evidence

- The emitted route table contains exactly the four intended method/route entries. `/api/auth/` and `/api/admin/` are absent; there was no broad route discovery.
- Canonical `validateSession` is bundled. `JWT_SECRET` remains a runtime `process.env` lookup captured into a module-level constant. The source fallback string `your-secret-key-change-in-production` is present, but no actual secret value was loaded or inlined.
- `DATABASE_URL`, `HYPERDRIVE`, `HYPERDRIVE_FRESH`, `EMAIL_RENDERER`, `PAGE_STUDIO_RELEASE_ENVIRONMENT`, `FIGFLOW_EDM_DRAFT_SAVES_ENABLED`, and `FIGFLOW_EDM_APP_ORIGIN` remain runtime lookups. No feature flag was enabled.
- `AsyncLocalStorage`, request-context `useEvent()`, `transactionWithoutRetry`, and the cleanup plugin's `afterResponse` hook are present.
- The artifact imports `cloudflare:workers`, `node:process`, `node:async_hooks`, and pg-related Node networking modules. This confirms the intended cloudflare_module shape, not workerd compatibility.
- Static checks rejected common unrelated secret constants (`SESSION_SECRET`, Xero/Resend/Groq/MCP/cron secrets) and confirmed the exact route table. Focused ESLint passed for `nitro.config.ts`.

## Unresolved runtime requirements — no readiness claim

1. **Workerd startup and module initialization:** verify `process.env.JWT_SECRET` is populated before module evaluation. The existing insecure fallback was not changed or hidden; production must configure the real secret. Verify `event.context.cloudflare.env` is populated for every route.
2. **Fresh Hyperdrive behavior:** with workerd-only bindings, prove cached and fresh `connectionString` resolution, per-request clients, dedicated fresh `transactionWithoutRetry` connections, rollback/commit behavior, and cached/fresh cleanup after responses. No database was contacted.
3. **Node networking compatibility:** pg uses `node:net`, `node:tls`, `node:dns`, and related builtins. Their actual workerd behavior and Hyperdrive connectivity require an isolated runtime test with approved non-production bindings.
4. **Renderer RPC:** `EMAIL_RENDERER` and `PAGE_STUDIO_RELEASE_ENVIRONMENT` must be present and match. Render success, failure, timeout, and RPC disposal behavior remain untested.
5. **Route semantics:** exercise the four routes with synthetic workerd requests, including disabled-flag 404, exact origin/JSON gates, auth and revocation, design permissions, source reads, transactions, and error mapping. No runtime request was made.
6. **Transport architecture:** parent owns Wrangler/bindings, Pages routing, deployment target, and source architecture review. This spike does not establish those decisions or production readiness.
