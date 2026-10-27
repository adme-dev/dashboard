# Authenticated engine worker transport

27 October 2026. Task 2 implementation in `workers/banner-engine/transport/` and
`scripts/banner-studio/engine-worker.ts`. This is an explicit one-job pull around
the existing `runEngineAttempt` and `createLinuxEngineAdapter`; it does not
provision a daemon, enable a capability or change the existing runner/runtime.

## Operator invocation

Configure `BANNER_ENGINE_ENABLED=true` and `BANNER_ENGINE_SERVICE_TOKEN` in the
worker's private environment. The token must be 32–4096 printable non-whitespace
ASCII characters; never put it in command arguments, job payloads or reports.
The application must separately configure its matching service token, private
bucket and trusted capabilities. An existing accepted Linux runtime manifest
and its matching retained native proof are required.

```sh
pnpm exec tsx scripts/banner-studio/engine-worker.ts --once \
  --origin https://dashboard.example \
  --engine photocraft \
  --manifest /srv/banner-engine/runtime/runtime.json \
  --staging-root /srv/banner-engine/private/staging \
  --workspace-root /srv/banner-engine/private/attempts
```

The example origin and paths are operator placeholders. Use `vectorcraft` for
its separately configured capability. `--help` prints instructions without
loading a manifest or contacting the application. No command builds or launches
Docker until an actual claimed job reaches the existing trusted runtime.

TLS is required. For an explicitly owned local proof only, set an origin such as
`http://127.0.0.1:PORT` and pass `--allow-loopback-http`. The HTTP exception accepts
only `127.0.0.1`, `[::1]` or `localhost`; arbitrary HTTP hosts remain rejected.
Origins cannot contain credentials, paths other than `/`, query strings or
fragments. The worker always posts to `/api/internal/banner-engine`.

Exit codes are `0` for idle or authority-acknowledged success, `1` for a known
failed attempt, `2` for uncertainty, and `64` for unavailable configuration or
runtime. SIGINT/SIGTERM abort the attempt and allow the runner's bounded cleanup
and termination receipt. Printed outcomes contain only status, IDs and fixed
failure codes. Raw exception messages, source content and credentials are never
printed. The CLI performs one pull and exits; it never retries a request or job.

## Integration interface

`runEngineWorkerOnce(configuration)` accepts operator-owned `origin`,
`serviceToken`, absolute `stagingRoot` and `workspaceRoot`, and a trusted
`EngineAdapter`. Optional configuration is `allowLoopbackHttp`, `signal`,
`requestTimeoutMs` (default 10 seconds, maximum 30 seconds), `pollIntervalMs`
(default 1 second, maximum 5 seconds), `abortGraceMs` (runner default 5 seconds,
maximum 10 seconds), and a trusted `fetch` implementation for integration tests.
Invalid configuration throws a content-free error before claiming a job.
The direct function is an explicitly invoked integration boundary; the CLI owns
the additional environment enable switch and runtime manifest selection.

Requests and responses use the strict shared `bannerEngineJobs.ts` schemas.
Input/output are capped at 16 MiB; transfer JSON is capped at 24 MiB and control
messages at 64 KiB. Response streams are counted before parsing regardless of
Content-Length, with a deadline covering both fetch and body reading. Invalid
UTF-8, non-JSON responses, unknown fields, redirects and changed response URLs
reject. URLs in response data are never used. Requests disable redirects and
send authentication only to the configured fixed endpoint.

Claim validation checks the exact configured engine/version/MIME capability and
deadline before accepting input. The worker verifies actual input byte count and
SHA-256, stages it under a generated attempt directory, and invokes the existing
runner once. It checks authority status before input transfer and execution,
polls during transfer/execution, and checks again immediately before completion.
Only `running` allows progress. Cancellation, expiry, an unexpected authority
state or a failed status exchange aborts execution and fences success.

Before upload the worker reads the local durable success receipt, validates its
request/result binding, independently bounds and hashes the PNG, checks its
reserved artifact ID and capability proof pins, and reuses full PNG validation.
Only a `succeeded` completion acknowledgement yields worker success. A local
render is not an accepted application result until that acknowledgement arrives.

## Durable claims and uncertainty

Both roots must remain private, durable, operator-owned and shared by every
process that could receive the same attempt. Roots reject symlink leaves;
generated file reads reject descendant symlinks, hard links, non-regular files,
path escapes and files changing during the read. Parent ownership is a trusted
host prerequisite, not a defense against another process running as that user.

The staging directory is named `SHA256(lowercaseAttemptId)` and is exclusively
created and fsynced before input retrieval. It contains read-only `input.native`
and an atomically replaced, fsynced `transport.json`. The journal records only
identity, request hash, state, fixed failure code, termination and
`automaticRetry:false`; neither the service token nor claim token is persisted.
The existing runner independently claims the attempt beneath its durable root.

An existing staging claim, even if empty or partial, holds replay and does not
send a failure that could invalidate another active worker. An existing runner
claim also prevents execution. Missing or malformed runner termination evidence
is `unconfirmed`, never assumed stopped. The transport retains all claims and
artifacts and has no cleanup, resume-upload or retry API.

A lost claim response leaves identity unknown locally and must expire/reconcile
at the server authority. A lost input/status response aborts the current attempt.
A lost completion/failure acknowledgement never causes another upload, a failure
after possible success, or another execution. Exit `2` requires reconciliation
against authority state and owned runtime termination; deleting either root or
requeuing the attempt is not a recovery procedure. Retention and production
reconciliation remain separate integration work.

## Verification and remaining boundaries

Focused verification passed **124 tests across four files**, including 38
transport tests. Coverage includes origin restrictions, real loopback HTTP
redirect rejection with no credential forwarding, streamed size limits and
stalls, bad claim/input identity and bytes, pre-execution and active cancellation,
deadline expiry, noncooperative termination, concurrent and partial replay holds,
lost claim/status/completion/failure responses, and no execution retry.

```sh
pnpm exec vitest run test/banner/engineTransport.test.ts test/banner/engineRunner.test.ts test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts
pnpm exec eslint workers/banner-engine/transport test/banner/engineTransport.test.ts scripts/banner-studio/engine-worker.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --allowJs --module esnext --moduleResolution bundler --target es2022 workers/banner-engine/transport/index.ts test/banner/engineTransport.test.ts scripts/banner-studio/engine-worker.ts
pnpm exec tsx scripts/banner-studio/engine-worker.ts --help
```

The CLI missing-configuration path was also exercised and returned exit `64`
with only a sanitized error. Vitest prints the existing Vite `__dirname` config
warning. Tests use the real runner and private temporary files with a controlled
adapter; the redirect test uses a local HTTP listener. They do not prove native
engine rendering, hosted application authentication/storage/DB integration,
editable import, managed artwork fidelity or print acceptance.

The coordinator owns the actual native HTTP/SQL integration proof and source
reconciliation. This lane changed only its assigned transport, CLI, test and
report files. No Git operation, deployment, live-provider/DB change, Docker build
or Docker launch was performed by this lane.
