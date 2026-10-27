# Authenticated engine jobs: server authority

27 October 2026. Task 1 of [ENGINE-JOBS-PLAN.md](ENGINE-JOBS-PLAN.md) is implemented as a default-off private render-preview API. It creates no Banner layers, public assets, editable-import authority, runtime provisioning or deployment.

## Files and interfaces

`server/utils/banner/engineJobs.ts` exports `createEngineJobAuthority({ transaction, storage, capabilities, now? })`. Production composition is `engineJobAuthority(event)`, which uses the existing `transactionWithoutRetry` helper. Every authority transaction executes once. The ordinary database query/retry wrappers are deliberately avoided because a lost claim or completion acknowledgement must not replay a transaction.

The factory accepts an ordinary database transaction callback whose client exposes `query(sql, params) -> { rows }`, and `EngineJobStorage` with `put(key, bytes, mimeType)` and `get(key, {bytes, sha256})`. These are production dependency boundaries, also used by the coordinator's owned local PostgreSQL proof. The public methods are:

- `submit(actor, body)` returns a content-free job snapshot.
- `status(actor, jobId)` returns the same snapshot, including an accepted result receipt when present.
- `cancel(actor, jobId, {attemptId})` fences the reviewed attempt and returns its snapshot.
- `output(actor, jobId)` returns a verified private PNG buffer.
- `service(action)` implements the shared claim/input/status/complete/fail protocol.

Routes are POST `/api/agency/banner-studio/engine-jobs`, GET `/:jobId`, POST `/:jobId/cancel`, GET `/:jobId/output`, and POST `/api/internal/banner-engine`. Wire schemas and resource constants come from the coordinator-owned `shared/bannerEngineJobs.ts`. User submission/cancellation require `requireWriteAccess`; status/output require `requireAuth`. Submission uses the existing fail-closed database rate limiter at ten calls per user per minute.

## Authority, source and idempotency

Migration `483_banner_engine_jobs.sql` adds one independent table and a trigger protecting immutable identity, claims and terminal states. It does not repurpose dissection tables. No cascading foreign keys delete replay records when a project, client or user is removed; missing/currently inaccessible source instead blocks the API. Existing migration numbers were checked before selecting 483.

The authority loads and locks the current `banner_projects` row. Client projects require the existing social-client permission policy and a fresh locked assignment lookup for users without all-client access. Null-client projects require the current creator or existing all-client authority. Historical jobs additionally pin project client and creator, so moving/reassigning a project cannot grant access to its historical private artifacts. User access is rechecked before and after asynchronous output reads. Service input retrieval also checks source before and after private reads.

`engineJobSource(project)` hashes a recursively key-sorted JSON object containing saved canvas data, project/client/creator identity and normalized saved revision. The submitted revision must equal saved `updated_at` after ISO normalization. The client cannot provide source hashes, ownership, asset identities, storage keys, deadlines or runtime limits.

A request UUID is unique per submitting owner. Its digest binds the normalized complete submission and actual native-input byte count/SHA-256. Exact duplicates return the existing job after current project access/source checks. Different payloads conflict. New input is written before queue admission, then source and access are rechecked in the admission transaction. Concurrent identical submissions resolve through the database uniqueness constraint. Losing/unacknowledged admission writes retain their private objects for reconciliation.

## Private storage and HTTP

`engineJobStorage.ts` accepts only the dedicated `BANNER_ENGINE_BUCKET` binding. It has no public storage or filesystem fallback. Input keys and output identities are server-derived; `engineJobOutputId` matches the existing runner's deterministic output-ID algorithm without importing runner filesystem code. Conditional `put` uses `etagDoesNotMatch: '*'`; a null response means collision and rejects. No authority path overwrites or deletes an existing object. Reads reject absent/bodyless objects, verify declared size, bound actual streamed bytes and verify SHA-256.

`engineJobHttp.ts` requires:

- `BANNER_ENGINE_ENABLED` exactly `true`.
- `BANNER_ENGINE_CAPABILITIES`: nonempty strict trusted PhotoCraft/VectorCraft capability JSON with exact executable/proof pins and no duplicate registrations.
- `BANNER_ENGINE_SERVICE_TOKEN`: 32–512 printable non-space ASCII characters.
- The dedicated private `BANNER_ENGINE_BUCKET` object binding.

Event bindings take precedence, including explicit disabled values; only text settings can fall back to process environment for local tests. Service bearer authentication is timing-safe. Actual native-request TLS or encrypted socket transport is required; forwarded-protocol headers do not upgrade plaintext. The original native `Request` in `event.context._platform.cloudflare.request` takes precedence, with the flattened `event.context.cloudflare.request` and H3 web request supported as native alternatives. Request-shaped JSON is not transport authority. Explicit `BANNER_ENGINE_ALLOW_LOOPBACK=true` permits HTTP only when both host and socket peer are loopback.

The native web stream or backpressured Node stream is bounded before JSON parsing, independently of Content-Length. The installed Pages preset instead consumes `request.arrayBuffer()` before invoking Nitro's Node adapter. For that consumed native platform request only, the helper accepts the adapter's raw `Buffer` at `event.node.req.body`, checks actual byte length before decoding and never serializes parsed objects or strings as a fallback. This downstream check does not bound the preset's earlier allocation: the separately owned Pages entry guard must enforce byte/time limits before prebuffering. Body limits are 24 MiB for submission/completion and 64 KiB for cancellation; input/output byte caps are 16 MiB each, dimensions 2048, pixels 2048², runtime 120 seconds. Compressed, malformed UTF-8 and malformed JSON bodies reject. Stream reads have a 30-second deadline and cancel on overflow or timeout. A single timer race per stream avoids accumulating timeout handlers from tiny chunks. API errors discard infrastructure messages and payload-bearing diagnostics. Every response, including authentication errors, is private/no-store with nosniff and Cookie/Authorization Vary headers.

## R2 Pages helper correction

The installed `cloudflare-pages.mjs` and Nitro `runtime/internal/app.mjs` were inspected directly. The preset passes `url.protocol` (`https:`), while node-mock-http's synthetic socket recognizes only `https`; it also passes a prebuffered body to a synthetic request that is not a Node `Readable`. The helper now uses the trusted native platform URL and the bounded raw-byte fallback described above. Default-off and service authentication remain in force.

`test/server/utils/bannerEnginePagesBridge.test.ts` invokes the real H3 `toNodeListener` through the actual `fetchNodeRequestHandler`, reproducing the exact preset argument shape and Nitro context propagation without starting a server. It tests both the root node-mock-http 1.0.4 used by the reviewer and Nitro's currently resolved 1.0.5 dependency, with H3 1.15.11. Before the correction, valid service requests returned 403 and body-only parsing returned 400. After the correction, all **40 bridge cases** pass, covering both trusted context shapes, original-request precedence, valid HTTPS/body, forged forwarding and Request-shaped objects, bearer-before-body ordering, default-off, actual UTF-8 byte limits, malformed/oversized/compressed input and rejection of parsed-object or unbound buffer fallbacks.

Fresh worker verification:

```sh
pnpm exec vitest run test/server/utils/bannerEnginePagesBridge.test.ts test/server/utils/bannerEngineJobBoundaries.test.ts test/server/utils/bannerEngineJobs.test.ts test/server/utils/bannerEngineResult.test.ts test/banner/engineJobsContract.test.ts --maxWorkers=1
pnpm exec eslint server/utils/banner/engineJobHttp.ts test/server/utils/bannerEnginePagesBridge.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node,vitest/globals server/utils/banner/engineJobHttp.ts test/server/utils/bannerEnginePagesBridge.test.ts
```

Result: **111 tests passed across five files**, scoped lint passed, scoped strict TypeScript passed. The existing Vite `__dirname` warning remains. This correction proves local helper compatibility, not entry-level prebuffer protection, deployed Pages behavior or full repository type safety. The entry guard, its integration review and hosted acceptance remain coordinator-owned. No dependency/Git/deployment/live call or new server/native runtime launch was performed in this correction lane.

## Claims, cancellation and publication

Claims atomically select one eligible queued row with `FOR UPDATE SKIP LOCKED`, verify current source/capability, and transition it to running within one transaction. The returned random 256-bit claim token is persisted only as SHA-256. The immutable request has a five-minute admission deadline; claim records a separate execution deadline at the earlier of that deadline and claim time plus 120 seconds. No retry or requeue API exists.

A queued cancellation is terminal `cancelled`. A running cancellation becomes `cancelling`, immediately blocking successful publication. The worker subsequently reports termination. Unconfirmed termination, duplicate local attempts, receipt-write failure and transport uncertainty become terminal `uncertain`; they never grant another execution. Expired queued work becomes `expired`, while expired running/cancelling work becomes `uncertain`. Expiry is checked on job access and in bounded claim-time sweeps; this increment creates no scheduled sweeper.

Completion independently reloads job authority and owned input, validates actual bytes/PNG/dimensions/result identity/source/capability pins using `validateBannerEngineResult`, then conditionally writes the immutable private output. A final transaction locks job and project again, checks current source and active claim, and CAS-publishes success only before both deadlines. Cancellation/source change during storage prevents success. Input and output objects survive uncertain database acknowledgements. Repeated completion never rewrites an output or reruns the engine; service status provides reconciliation observation. Terminal rows, including uncertainty holds, are immutable.

## Verification and handoff

Worker-run focused checks passed:

```sh
pnpm exec vitest run test/server/api/bannerEngineJobs.test.ts test/server/utils/bannerEngineJobs.test.ts test/server/utils/bannerEngineJobBoundaries.test.ts test/banner/engineContract.test.ts test/server/utils/bannerEngineResult.test.ts --maxWorkers=1
pnpm exec eslint server/utils/banner/engineJobs.ts server/utils/banner/engineJobStorage.ts server/utils/banner/engineJobHttp.ts server/api/agency/banner-studio/engine-jobs server/api/internal/banner-engine.post.ts test/server/utils/bannerEngineJobs.test.ts test/server/utils/bannerEngineJobBoundaries.test.ts test/server/api/bannerEngineJobs.test.ts
```

Result: **81 tests across five files**, including **27 new tests**. Scoped strict TypeScript diagnostics were checked with the installed TypeScript compiler API for all eleven owned TypeScript files (ES2022, ESNext/bundler, strict, Node/Vitest types, repository aliases): **zero diagnostics**. This is a file-scoped check, not a claim that the entire repository typechecks. Vitest prints the existing Vite `__dirname` configuration warning.

Coverage includes null/client scope rejection, current ownership, stale sources, conflicting idempotency payloads, claim-token binding, running-only input access, queued/running cancellation, ambiguous termination, actual byte/pin rejection, successful private output, source/cancel races during output writes, and lost completion acknowledgements. HTTP tests use a real loopback H3 listener with mocked authentication/authority dependencies; storage/lifecycle unit tests use controlled dependencies. Those unit tests alone are not PostgreSQL concurrency proof or hosted acceptance.

The coordinator separately reported eleven passing owned-local PostgreSQL and native-runner integration cases at `output/editable-artwork-engine-jobs/proof-2026-10-27T05-09-52-734Z`, including PhotoCraft and VectorCraft over authenticated loopback HTTP. The coordinator owns that evidence, the local migration application, final integration rerun and independent review. This worker made no live database/provider calls, deployments, dependency changes or git mutations.

Remaining gates are private production bucket/bindings and service provisioning, deployed transport/authentication/database/storage verification, retention/reconciliation operations for held/orphan objects, any explicit retry policy/UI, and editable-document/print acceptance. Synthetic capability pins in unit fixtures are never production registrations.

All work is uncommitted in the shared `adme-dev/banner-editable-artwork` checkout. Initial observed source was `47ec30c3522f6ab660d730776709770c8a22d7c8`; local `origin/main` was `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`. No remote refresh or branch reconciliation was performed in this no-git-mutation lane. Resume by reviewing this lane's files and the coordinator's completion audit, rerunning focused/local SQL proof after any fixes, then reconciling the source before considering a release.
