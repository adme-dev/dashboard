# Authenticated engine jobs implementation plan

> For agentic workers: use the existing execution workflow and Orca supervision. Preserve the shared dirty worktree. No commits or deployments in this increment.

**Goal:** Connect the proven render-preview engine to authenticated durable application jobs and private input/output transfer.

**Architecture:** Banner Studio remains document and permission authority. A PostgreSQL job is the durable work queue; an explicitly configured trusted Linux worker pulls one attempt, stages immutable input and invokes the existing isolated runner. This avoids placing desktop computation inside Pages. Only PhotoCraft/VectorCraft render-preview is eligible; native editable wording remains the separate existing companion workflow.

**Tech stack:** Existing Nitro, Postgres, Zod, private R2 binding, Node Linux runner. No new dependencies.

**Spec:** ONLINE-ENGINE-DESIGN.md, ONLINE-ENGINE-CONTRACT.md, ONLINE-ENGINE-RUNNER.md; these implementation choices are the coordinator's, within the approved online-engine direction.

## Contract and boundaries

- Default off. `BANNER_ENGINE_ENABLED` must equal `true`; trusted `BANNER_ENGINE_CAPABILITIES` JSON and `BANNER_ENGINE_SERVICE_TOKEN` (at least 32 characters) required. Read Cloudflare event bindings first, process env only for local/test fallback. Dedicated **private** `BANNER_ENGINE_BUCKET` binding; never use public asset URLs or public storage fallbacks.
- This slice limits native input and PNG output to 16 MiB each, dimensions to 2048, runtime to 120 seconds. Base64 JSON bodies capped at 24 MiB by a streaming reader, not Content-Length alone. Capability versions/proof hashes remain pinned by existing shared schemas and local runtime proof.
- User POST `/api/agency/banner-studio/engine-jobs`: `{requestId,projectId,sourceRevision,engine:{id,version},input:{mimeType,base64},output:{width,height}}`. UUID requestId is owner-scoped idempotency, bound to the exact canonical payload digest. Auth/write/client/null-client ownership checks and canonical saved project source hash are server-derived. The source revision must match saved `updatedAt`. No user-supplied commands, URLs, paths, client IDs or limits.
- GET `/api/agency/banner-studio/engine-jobs/:jobId` gives content-free status plus accepted result metadata. GET `/:jobId/output` returns private PNG only after current project access/source checks. POST `/:jobId/cancel` takes `{attemptId}`. All responses private/no-store. No automatic Banner mutation or public asset creation.
- POST `/api/internal/banner-engine` is a service-only endpoint using a timing-safe bearer token check; transport is TLS except explicitly allowed loopback tests. Actions are strict JSON unions: `claim {engine:{id,version}}`, `input/status {jobId,attemptId,claimToken}`, `complete {jobId,attemptId,claimToken,result,outputBase64}`, `fail {jobId,attemptId,claimToken,code,termination}`. Fixed enum failure codes; termination `not-started|adapter-settled|unconfirmed`. A claim returns `{request,claimToken}` or `{request:null}`. Input returns `{base64}`. Status returns `{status}`. Complete/fail return `{status}`.
- Database atomically changes one queued attempt to running using SKIP LOCKED; claim token is random, only its digest is stored. The full request is immutable. Any lost claim response means eventual uncertain, never re-execution. Running expiry becomes uncertain. Cancellation fences result persistence immediately; worker aborts and confirms termination. Queued cancellation is terminal. No automatic retry; explicit retry UI/API is deferred until this transport has proof.
- Store native input before queue admission with a server-derived key; no job points at caller-selected keys. Output uses immutable job/attempt-derived key and exact output artifact identity. Check actual bytes, dimensions, pinned result identity, current project source and owned input before success CAS. Cancellation/source change during validation must prevent success. Uncertain DB acknowledgements retain artifacts for reconciliation, never delete possibly accepted objects.
- Worker polls a configured origin only, with redirects forbidden; never follows URLs from a response. Bound responses before parsing, validate request/capability and input SHA/length before staging, run once in durable attempt workspace, poll status and abort on cancellation/expiry/transport uncertainty. Upload success only after validated local receipt and output. A failed response never reruns the engine. Do not claim render-preview is editable import.

## Ownership and tasks

### 1. Server authority — worker

Own `server/utils/banner/engineJobs.ts`, `engineJobStorage.ts`, `engineJobHttp.ts`, new engine-jobs user routes and internal endpoint, additive migration (check next available number), focused server tests, `ENGINE-JOBS-SERVER.md`. Reuse auth/client/rate-limit/database patterns, without repurposing dissection tables. Root owns shared wire protocol. No existing runner edits.

- [x] Write tests for tenant isolation, source changes, payload-bound duplicate submission, concurrent claim, cancellation/late result, deadline/unknown termination, bad pins/bytes and private output reads.
- [x] Implement the durable authority and bounded private storage/HTTP boundary.
- [x] Run scoped tests and lint. Migration runs only against an owned local Postgres proof; do not apply to live DB.

### 2. Worker transport — worker

Own `workers/banner-engine/transport/`, `scripts/banner-studio/engine-worker.ts`, `test/banner/engineTransport.test.ts`, `ENGINE-JOBS-WORKER.md`. Root owns shared wire protocol; consume it after it exists. Use the existing runner and trusted Linux adapter unchanged unless coordinating a necessary fix.

- [x] Test origin/redirect restrictions, bounded responses, invalid claim/input, cancellation/transport failure, duplicate/lost response and no execution retry.
- [x] Implement one-job transport plus explicit operator CLI; no daemon/service provisioning.
- [x] Run tests, lint and retain invocation instructions without secrets.

### 3. Integration and review — coordinator

Own `shared/bannerEngineJobs.ts`, focused shared tests, integration/local Postgres proof and high-level documentation. Kimi owns independent `COMPLETION-AUDIT.md` only.

- [x] Pin strict wire contracts and shared body/size constants before dependent workers implement.
- [x] Exercise actual SQL race/expiry semantics on a disposable local database and real Linux runner through authenticated local HTTP with private fixture storage. Separate synthetic auth/storage from actual native execution evidence.
- [x] Review all new code and perform focused regression; obtain independent review after implementation.
- [x] Update handoff, capability docs, public feature wording where warranted, and Orca card. Record remaining live provisioning, persisted hosted storage/DB, retention/recovery, editable online wording, other engines and print/provider acceptance honestly.

## Review focus

Lost acknowledgements never trigger duplicate execution or destructive cleanup. Cross-project and current ownership changes cannot retrieve artifacts. Cancellation/source edits racing result upload never publish success. Shared service authentication is not user authority. A stale or synthetic runtime proof cannot activate a different engine. No application UI or deployment claim is made merely because the API and local worker pass.

## Review-driven completion

The implementation also corrects unconfirmed native cleanup propagation, installed Pages request compatibility/prebuffering and tiny-chunk transport allocation. [Final evidence](ENGINE-JOBS.md) records 370 unique passing local tests, real PostgreSQL/HTTP/Linux execution and the small actual Pages fixture build. Checkboxes describe this bounded local implementation; hosted activation, a full dashboard build, editable online wording and remaining product requirements are separate gates.
