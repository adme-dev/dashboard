# Email-design Worker admission wrapper

## Owned changes

Only `workers/email-design-spike/` files were added or updated:

- `admission.mjs` — outer fetch admission and bounded body replay.
- `build.mjs` — bundles the outer wrapper and Nitro artifact as `dist/worker.mjs`.
- `test-admission.mjs` — bounded one-worker Miniflare scenarios.
- `nitro.config.ts` — existing explicit four-route standalone configuration.
- `package.json` — build/test commands and Node 24.18.0 engine.
- `README.md` — scope, commands, and runtime limits.
- `.gitignore` — generated `.nitro/` and `dist/` remain ignored.

No canonical source, native Stage A file, public route, deployment configuration, or database was changed/accessed. All pending Orca messages were processed and the final queue returned zero.

## Admission behavior

Before dynamically importing Nitro or reading a body, the wrapper:

1. Requires `EMAIL_DESIGN_ENVIRONMENT` to be exactly `staging` or `production` and to equal `x-xeroflow-email-design-environment`. Invalid/missing configuration returns 503 `email_design_environment_unavailable`; mismatch returns 403 `email_design_environment_mismatch`.
2. Requires a nonempty `JWT_SECRET` that is not `your-secret-key-change-in-production`; failures return 503 `email_design_secret_unavailable`.
3. Reuses exported `DESIGN_ACTION_LIMITS.envelopeBytes` rather than copying its value. Declared or observed bytes above that maximum return 413 `design_request_too_large`; overflow invokes stream cancellation. A bounded replay is then passed to Nitro.
4. Dynamically imports and caches Nitro only after admission, so module-time JWT initialization uses the admitted runtime binding. Canonical origin, session, role/permission, renderer, and database checks remain in their original handlers/services.

No context-promotion plugin was added: current Nitro promotes `_platform` into `event.context` itself. Canonical per-route 4096-byte initialize/metadata checks remain inside those handlers. The outer guard enforces only the shared maximum before Nitro buffering; moving smaller limits outward would require a shared canonical constant rather than a duplicate.

## Actual Miniflare evidence

Built with exact Node `24.18.0`, Nitro `2.13.4`, esbuild `0.28.1`, and Miniflare `4.20260708.1`. Tests used compatibility date `2026-07-08` and **`nodejs_compat` alone**, one worker per scenario, 15-second request deadlines, 5-second disposal deadlines, and `dispose()` in `finally`. No multiworker/getWorker path or real secret/database was used.

All nine scenarios passed:

- Disabled feature flag → 404 `not_found`.
- Missing environment → 503 `email_design_environment_unavailable`.
- Invalid `development` environment → 503 `email_design_environment_unavailable`.
- Environment/header mismatch → 403 `email_design_environment_mismatch`.
- Missing JWT secret → 503 `email_design_secret_unavailable`.
- Canonical insecure fallback → 503 `email_design_secret_unavailable`.
- Chunked body exceeding the canonical maximum → 413 `design_request_too_large` before canonical no-token auth could return 401. Miniflare did not propagate source-stream cancellation to the test, so no upstream-callback claim is made.
- No token → 401 `design_session_invalid` from canonical auth.
- Synthetic canonical raw-JSON+HMAC tokens: wrong key → 401 `design_session_invalid`; configured key → 503 `design_read_unavailable` at the deliberately unavailable database boundary. This proves the admitted binding was used by module-time JWT initialization without contacting a database.

Final focused ESLint and `git diff --check` passed. Final outer artifact `dist/worker.mjs` is **774,958 raw bytes / 206,577 gzip bytes** (`Z_BEST_COMPRESSION`). This second-bundle size is reported for parent architecture review, not presented as an optimization.

## Remaining requirements

- Parent must rerun its actual local-PostgreSQL/Miniflare integration suite against this new outer artifact, including initialization/read/metadata, revocation, transactions, and client cleanup. That suite and its database are outside this task.
- Full Hyperdrive fresh/cached connectivity, renderer RPC, and complete four-route behavior still require isolated acceptance. These tests establish admission and JWT behavior only.
- Production adoption still needs parent transport/binding configuration with no public entry, workers.dev/preview URLs disabled, exact environment attestation, and architecture review. No deployment or feature enablement is justified by this spike.
