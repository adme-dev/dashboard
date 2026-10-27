## Coordinator correction — 27 October 2026, 14:49 UTC

The first implementation slice is now **PNG-only verified source identity**. Independent real-codec and workerd tests proved that all tested A4 JPEG encodings exceed the existing 64 MiB decoder budget; JPEG and WebP retain their legacy paths without `manifest.source`. The earlier proposal below to validate both encodings is superseded for this increment. Full RGBA PNG decoding also allocates too much memory at the admitted maximum; a dedicated streaming scanline validator is being implemented with 10 MiB compressed input, 4096px edge and 10,000,000-pixel limits. No decoder/runtime limit is increased, no normalized bytes replace originals, and no full R01 or hosted validation claim is made.

The metadata preservation and exact-byte checks are implemented locally. Red/green disposable PostgreSQL tests prove source preservation and rejection of model-supplied source metadata; all 45 job/concurrency tests pass after updating their synthetic storage boundary to its current interface. Candidate integration remains gated on the bounded validator and final review.

# R01 verified and owned ingestion implementation plan

> For agentic workers: use `superpowers:executing-plans` task by task. This dispatch authorizes planning only, in this file; no application edits, database/provider operations, deployment, sibling changes or additional agents.

**Goal:** admit verified original JPEG/PNG bytes with immutable source identity and explicit optional A4 intent, then enforce current project/client authority throughout the existing Dissector lifecycle.

**Architecture:** retain `/api/agency/banner-studio/dissect`, `banner_dissections`, its manifest, exact-generation claims and existing dispatch/recovery. Add server-owned metadata beside `execution`; never accept it from a model or interpret the existing import-destination column as source ownership.

**Stack/spec:** Nuxt/Nitro, PostgreSQL JSONB, request-bound R2, existing `pngjs`/`jpeg-js`, Zod and Vitest. Implements [PRD R01](PRD.md), with R12/A05 authority dependencies and [technical design boundaries](TECHNICAL-DESIGN.md). Physical metadata does not complete R07 custom-format import or R13 print acceptance.

## Scope and evidence

Inspected 28 October 2026 in the original `banner-editable-artwork` workspace. HEAD was `47ec30c3522f6ab660d730776709770c8a22d7c8` on `adme-dev/banner-editable-artwork`, with no configured upstream and substantial pre-existing changes. The locally recorded `origin/main` was `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`; divergence was 1 local / 11 remote commits. No fetch was performed under the source-only constraint, so this is not confirmation of current remote main. Plan execution must reconcile onto freshly fetched main under the coordinator's ownership; do not alter the release candidate while CI runs.

Initial working-file SHA-256 anchors (HEAD alone does not identify this dirty source; the coordinator began the first slice during this review, so these identify the inspected baseline, not its later edits):

| File | SHA-256 |
|---|---|
| `PRD.md` in this directory | `237053350cebed05aff2f868af1b6b223e4cdf2db03303d48d2d9362ebe50510` |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `221be326dedb910293cea7d6b2929652b08a9f2410d6d4c2aad2365c61d219c5` |
| `server/utils/banner/dissectionJobs.ts` | `94273074646c4345312d48a5b3fdeb3a97b51ae6ae4988365e1e67ed7380382e` |
| `server/utils/bannerDissectorPipeline.ts` | `bab9ad074c896bfdf2bc51acb3feb384b971c61323e924a7222671452f1bb182` |
| `server/utils/banner/artworkValidation.ts` | `10799763c545c681f7f52f47e530f2cc636b0d3ffcc56e0b5bf0775b4b196368` |
| `app/components/banner/DissectorModal.client.vue` | `4bd09c9452d6210db913445d4a82953ddb0187a176ef5ae815e5ced07e479093` |

No tests were run by this planning worker; all commands below are future verification steps. Coordinator messages report real-PNG red tests, then a green pre-storage PNG/JPEG guard and source-identity work in progress; those results were not independently rerun here. No database schema or hosted behavior was inspected live.

## Source findings that determine the implementation

| Current interface/file | Consequence |
|---|---|
| `dissect/upload.post.ts:9–77`: `requireWriteAccess`, multipart `file`/`brand`, declared JPEG/PNG/WebP, 10 MiB, R2 put/head, insert, dispatch | Authentication and original storage exist. No magic-byte validation, actual dimensions, source hash, client/project binding or physical metadata. `.find()` silently accepts duplicate parts. Validation must precede R2/SQL/queue effects. |
| `server/database/migrations/034-banner-dissector.sql`; `dissect/[jobId]/import.post.ts` | `user_id`, `source_r2_key`, nullable `project_id`, JSONB `manifest` already exist. `project_id` is set on successful import and used for receipt replay; it is **not** source-project ownership. |
| `dissectionJobs.ts:85–101,226–289` | Retry rebuilds the root with `execution` only; `writeDissectionAttempt` also replaces the root. `dissectionArtwork` deliberately allowlists model artwork. Simply adding upload metadata loses it on first progress/retry. |
| `bannerDissectorPipeline.ts`: `runDissectionPipeline`, `downloadFromR2`, `persistLayer` | Claims the exact queued attempt; reads only its database-owned original key with stream limits; checks dimensions before `analyzeImage`. No stored-byte hash comparison. Derived assets have uploader but no `client_id`, and get public signed capability URLs. |
| `server/utils/bannerDissector.ts:923` | `getImageDimensions` is a permissive header probe, not image validation. PNG can be a partial header, JPEG skips segments loosely, WebP lacks VP8X; decode/crop supports PNG/JPEG, not general WebP. |
| `shared/utils/bannerAssetIdentity.ts`; `server/utils/banner/assetUploadValidation.ts` | Reuse `detectBannerAssetMime`. Existing validator computes content SHA but returns a request digest containing filename/scope, not the raw source SHA. It accepts other media, lacks image decode validation, and its safe filename minimum is unrelated to Dissector's generated original key. Do not use `requestDigest` as `source.sha256`. |
| `server/utils/banner/artworkValidation.ts` | Reuse bounded PNG validation and JPEG marker/decode strategy, plus static/orientation checks. Existing helpers have provider-facing 502 errors, different byte/pixel limits, and JPEG normalization re-encodes bytes. Adapt validation, preserve originals, map upload failures to 400/413/415. |
| `server/utils/social/clientAccess.ts`; `server/utils/roleResolver.ts` | Membership uses cached `queryOne`; permission resolution uses KV for 300 seconds and fallback on errors. These are insufficient for revocation-sensitive ingest/worker/result boundaries. |
| `server/utils/banner/engineJobs.ts`: `projectAccess`, `userJob` | Useful precedent: current project row, fresh/locked assignments, frozen client/creator comparison. Do not replace Dissector with engine jobs or reuse their document hash as an image hash. |
| `dissect/{history.get.ts,[jobId].get.ts,process.post.ts,[jobId]/cancel.post.ts}` | User-only checks today. History returns `sourceR2Key` and limits to 50 before any project/client check. `loadDissection` expires state before returning a row: new authority checks must happen before this write too. |
| `DissectorModal.client.vue:175–222`; `useBannerDissectionJob.ts` | Upload posts only `file` and `brand`; current project/revision already available for import. Modal is mounted by `app/pages/agency/banner-studio/[id].client.vue`, including unsaved `new`. Saved-job polling/retry has useful epoch and lost-response fences to retain. |
| `shared/bannerFormats.ts`; Dissector import/modal | Shared resolver recognizes `custom_WxH`, but Dissector import/modal only accept static `FORMATS` and choose nearest preset. Recording A4 metadata does not fix that R07 gap. |
| `test/server/api/bannerDissectionUpload.test.ts`; `test/server/utils/dissectionJobsPostgres.test.ts` | Current upload fixtures use `local fixture` / `synthetic image` as PNG bytes. Replace with real fixtures; transport tests passing those bytes prove no image validity. |

## Decisions and compatibility

Safely inferable from R01/R12 and current source:

- Preserve exact uploaded bytes; hash the complete original with SHA-256 before inference. MIME, size and dimensions come from bytes, never filename, multipart assertions or model output.
- Verified ingestion supports static JPEG/PNG. Per the coordinator's first-slice contract, existing unbound WebP upload remains unchanged and explicitly legacy/unverified, without `manifest.source` or an R01 validation claim; existing saved WebP jobs remain readable/cancellable. This compatibility preserves an advertised existing upload path while the bounded fix lands, not evidence of full WebP decode. Later client/project admission rejects WebP and must never fall through to the legacy path. Do not modify the general asset upload API's supported formats.
- Keep authenticated user-private JPEG/PNG upload for an unsaved, unassigned `/new` draft. It is a real existing entry point. Do not grant agency-wide access, or let an unauthorized supplied project/client fall back to this mode.
- Prefer saved-project scope; derive client and creator from the project. Support client-only scope for an unsaved client-assigned draft. Retain the uploader restriction for job reads/actions; client assignment is an additional condition, not a new grant to all colleagues.
- Physical A4 is explicit opt-in, not inferred from pixels/aspect ratio/EXIF/brand. Portrait means 210 × 297 mm; landscape 297 × 210 mm. Omitted means unknown physical size. Do not stamp 300 dpi or resample an original; effective PPI is derived separately from pixels and requested millimetres.

Implementation choices (conservative defaults, not numeric PRD promises): retain 10 MiB file maximum; propose 4096 px per edge and 10,000,000 pixels for validated sources, which includes 2480 × 3508 A4. Reject animation, PNG EXIF and EXIF-bearing JPEG until orientation mapping is implemented, following the existing repair path. Bound JPEG decoder memory to 64 MiB and reject if exceeded; unsupported valid encodings get a clear error. This narrows the old late-stage 10000 px / 40M check intentionally. A4 JPEG acceptance at that memory cap must pass real fixtures before enabling it; do not silently raise limits or claim every JPEG is supported.

## Contracts

Create `shared/bannerDissectionIngestion.ts` for versioned schemas/types. Keep the model manifest type separate from server-authoritative ingestion. The coordinator's first slice uses optional `manifest.source`; retain that contract. Later add optional `manifest.ingestion` for ownership/physical intent. Add these fields to `DissectionJob` and the persisted `DissectionRecord` intersection, not to the model-output allowlist.

```ts
type DissectionSource = {
  version: 1; mimeType: 'image/jpeg' | 'image/png'; byteLength: number;
  sha256: string; width: number; height: number
}
type DissectionOwner =
  | { kind: 'user'; userId: string }
  | { kind: 'client'; userId: string; clientId: string }
  | { kind: 'project'; userId: string; projectId: string;
      projectOwnerId: string; clientId: string | null }
type DissectionPhysical = {
  preset: 'A4'; orientation: 'portrait' | 'landscape';
  unit: 'mm'; widthMm: 210 | 297; heightMm: 210 | 297
}
type DissectionIngestion = {
  version: 1;
  owner: DissectionOwner;
  physical: DissectionPhysical | null;
  ingestedAt: string;
  sessionsInvalidatedAt: string | null;
}
```

`manifest.source` and, when introduced, `manifest.ingestion` are immutable after insertion. Ownership metadata requires a valid source record; the source-only slice makes no client/project/physical claim. `source_r2_key` remains the canonical private object locator; do not duplicate it into browser metadata. Source SHA is lowercase 64-hex. Validate the A4 width/height pair against orientation, not just each numeric union independently. `sessionsInvalidatedAt` captures the current server-side revocation marker for later queued-worker checks; it is not a token or credential and need not appear in public snapshots.

New helpers:

- `server/utils/banner/dissectionIngestion.ts`: `validateDissectionSource(file: { data: Uint8Array; type?: string }): { bytes: Buffer; source: DissectionSource }`; `parseDissectionUploadParts(parts): { file; brand: string | null; projectId?: string; clientId?: string; physical: DissectionPhysical | null }`; `assertDissectionSourceIdentity(bytes, source): void`.
- Multipart additions: optional single `projectId`, `clientId`, and `physical` JSON containing only `{ preset: 'A4', orientation }`. Exactly one file, at most one of each metadata part; reject unknown authority fields, duplicate parts, invalid IDs, malformed/oversized JSON. `brand` is at most 200 characters; all non-file fields combined at most 16 KiB. If project and client are both provided, client is an equality assertion against the current project, never authority to reassign it. Missing claim MIME can be detected; a supplied mismatching MIME is rejected.
- `server/utils/banner/dissectionAccess.ts`: `resolveDissectionOwner(db, actorId, input, mode)` returns the server-owned scope and current revocation marker; `assertDissectionAccess(db, actorId, record, mode: 'read' | 'write' | 'execute'): Promise<void>`. `db` is the existing transaction query interface; execute mode derives actor ID from stored `user_id`, never queue payload. Helpers re-read active user, role/custom-role permissions, current project and assignments using the transaction, without KV/query cache or fail-open fallback. Missing configured role or DB unavailability denies/503; do not rewrite global role policy as part of this increment.
- Preserve `queuedDissectionManifest(attemptId?)` signature; first-slice admission composes `{ ...queuedDissectionManifest(), source }`, later `{ ...queuedDissectionManifest(), source, ingestion }`. Preserve queue payload `{jobId, attemptId}`, retry request `expectedAttemptId`, deadlines, three attempts, five dispatch sends and lease semantics.

## Schema: no migration for the first slice or ingestion metadata

Use existing `banner_dissections.manifest` for all source/physical/ownership metadata. Do not add duplicate MIME/hash/dimension/DPI/client columns, a reconstruction table or another job queue. Keep `project_id` unchanged as the eventual import result. Missing `source` means source-unverified; missing `ingestion` means uploader-only legacy scope, even if source bytes are verified. Neither implies historical client ownership or physical size. Malformed/present-but-unknown metadata fails closed, not legacy fallback.

Migrations 026 and 167 already provide `banner_assets.client_id`; derived asset insertions should populate it when ownership enforcement is implemented. `banner_assets` has no generic metadata column in the inspected migrations; migration 176's metadata belongs to **video_assets**, not banner assets.

A separate result-delivery continuation may justify one nullable immutable `banner_assets.dissection_job_id` FK to `banner_dissections(job_id)` plus an index, to enforce job-origin policy on direct asset retrieval. That is relational provenance, not an excuse for new source metadata columns. Do not add it for the first slice. If chosen for the delivery gate, allocate the then-current migration number (483 is already engine jobs), leave legacy rows null, use restrictive deletion, and prohibit patching/rebinding it. No speculative backfill from URL, uploader or today's project client. Source ingestion itself needs zero DDL.

## Task 1 — immediately implementable: verified bytes and persistent source identity

**Files:** create the shared contract and `dissectionIngestion.ts`; modify `dissect/upload.post.ts`, `dissectionJobs.ts`, `bannerDissectorPipeline.ts`, `app/types/banner-studio.ts`. Adapt narrowly scoped reusable validation in `artworkValidation.ts` only if needed; do not change other callers' default budgets/errors. Keep current upload fields for the first slice; change help copy only to distinguish verified JPEG/PNG from legacy WebP. Tests: create `test/server/utils/bannerDissectionIngestion.test.ts`; extend upload/jobs/pipeline tests and real fixtures under `test/fixtures/banner/`.

This slice remains uploader-owned. Until Task 2, reject supplied project/client fields explicitly; do not accept and ignore them or advertise owned client ingestion. Defer ownership/physical metadata to Task 2/3; the first `source` record is exactly the six-field v1 contract above. This is source validation completion, not full R01 acceptance.

- [ ] Write failing tests for real valid PNG and baseline/progressive JPEG, then empty/spoofed MIME, truncated headers/pixels, bad PNG CRC/chunk lengths/end, zero/oversized dimensions, excessive decoded pixels, APNG, EXIF/orientation and duplicate multipart parts. Add a separate legacy-WebP test asserting it receives no verified source metadata, and later a scoped-WebP rejection test. Assert zero R2 writes, inserts, queue sends and inference calls for every rejected upload.
- [ ] Implement magic detection, bounded format structure checks before decode, bounded full decode, decoded/header dimension agreement and exact-byte SHA. For PNG use the existing noninterlaced 8-bit bounded strategy (CRC and chunk bounds, reject Adam7 before inflation); for JPEG validate segment lengths, supported SOF and end structure, then strict `jpeg-js` decode with memory/resolution caps. Do not call `normaliseArtworkReference` and store its PNG output as the original. Never allocate based only on `getImageDimensions`.
- [ ] Insert `source` with the queued row after original persistence; preserve existing R2 put/head and request-binding behavior. Preserve the raw bytes exactly. Storage/SQL acknowledgement ambiguity must not trigger automatic upload/dispatch replay or deletion of a possibly committed original; leave the generated job identity for reconciliation. Successful queue ambiguity retains queued/recoverable state as today.
- [ ] Preserve only server-owned `source` from the stored row in retry and progress SQL (and later `ingestion` by the same mechanism). Retry clears old artwork/result/import receipt while retaining source; progress/failure replacement merges source from the existing row, not from the supplied artwork. Cancellation/expiry/dispatch already update nested execution; prove they retain metadata too.
- [ ] Keep existing result IDs/receipts stable in the first slice; immutable original identity is checked separately at execution. When introducing scoped import, version any new result-identity binding to source/ingestion explicitly and preserve the exact legacy hash algorithm for existing results. `dissectionArtwork` must continue stripping model-supplied source/ingestion/execution/receipts. Compute returned and persisted `execution.resultId` from the same post-merge authoritative data. A same-attempt forged model source/physical/owner field cannot replace server facts.
- [ ] Before `analyzeImage`, bounded-read the original and revalidate/hash-match it against stored `source`. Fail on replaced bytes, MIME/dimension mismatch or truncation before a provider call. Legacy JPEG/PNG jobs without `source` must validate bytes before inference when explicitly retried, without inventing a historical hash/ownership or silently rewriting an already reviewed result hash. Legacy WebP retains its prior bounded read/header behavior only on the unbound compatibility path, and remains outside verified-ingestion acceptance.
- [ ] Green: run focused tests below. Add exact original-byte storage/hash checks and source preservation across retry/progress/failure/cancel/expiry/recovery/import. No ownership or physical metadata is synthesized. Task 2/3 adds A4 portrait/landscape round trips and verifies that omitted physical intent is `physical: null`.

```sh
pnpm exec vitest run test/server/utils/bannerDissectionIngestion.test.ts test/server/api/bannerDissectionUpload.test.ts test/server/utils/bannerDissectionJobs.test.ts test/banner/dissectorPipeline.test.ts test/server/api/bannerDissectionReadiness.test.ts test/banner/dissectionJobControls.test.ts
```

Expected red: current upload accepts arbitrary declared PNG bytes; metadata disappears on retry/progress. Expected green: real byte validation and persisted identity assertions pass; existing generation/dispatch tests retain their authority assertions. Do not replace the new validator with a mock in upload/pipeline acceptance tests.

## Task 2 — fresh ownership admission and lifecycle enforcement

**Files:** create `dissectionAccess.ts` and `test/server/utils/bannerDissectionAccess.test.ts`; modify all six Dissector route files (upload, process, history, job GET, cancel, import), `dissectionJobs.ts`, `bannerDissectorPipeline.ts`; extend `test/server/api/bannerDissectionProcess.test.ts`, `bannerDissectionReadiness.test.ts`, `dissectionJobsPostgres.test.ts` and pipeline tests.

- [ ] Red: test foreign user/project/client, inactive uploader, revoked client assignment, removed custom permission/read-only role, deleted project/client, and project reassignment between admission and execution. Include a primed stale cached grant. Assert no source read/provider/storage write after denial and no row expiry/mutation before authorization.
- [ ] Add the versioned `ingestion` metadata and parse explicit optional A4 intent alongside ownership; extend preservation tests to cover it. Resolve and freeze ownership at admission from fresh rows. Recheck after potentially slow parsing/storage and immediately before the durable insert/dispatch boundary. Use `transactionWithoutRetry` for the authority/insert operation; lock the current project and membership rows consistently for short local mutations, not across remote inference. A supplied inaccessible scope is denied, never downgraded to user scope.
- [ ] Apply current authority before job GET, history projection, expiry, cancel, retry, result access and import. History scopes in SQL before ORDER/LIMIT, optionally filtered to current project/client; remove unused `sourceR2Key` from the response. Return a sanitized ingestion projection (no source key or revocation marker), `private, no-store`. Preserve uploader-only job visibility for all three scope kinds.
- [ ] Worker claim still accepts only the exact queued generation. Load actor from the persisted job and recheck active role/assignment, frozen client/creator and revocation marker before source retrieval and each provider or result-persistence boundary. Add scope predicates/locked checks to mutations, not only a preflight read. Recovery may redeliver the same generation; the executor must deny revoked authority, with no new provider attempt or retry budget increase.
- [ ] Deny changed project client/creator even if the uploader can access both clients now. Ordinary canvas edits do not revoke source-image ownership; keep import's independent `expectedRevision` check. Revocation during an already dispatched provider call cannot recall transmitted bytes: discard the response, prevent further calls/result publication, record content-free failure and do not claim cancellation/refund.
- [ ] For import, check both source owner and current target under the existing job/project transaction before receipt replay. Project-owned sources import only into that project in this increment; client-only sources can target an authorized same-client project or create a new project with that `client_id`; new user-private sources create/import personal projects only. Do not silently rebind source ownership when setting `project_id`. Legacy unbound results remain owner-readable; require explicit re-upload under current scope for client-target import because their historical client cannot be established. Legacy personal import retains its existing receipt/result semantics.
- [ ] Green: test grant removal before/after R2 put, after queue admission, during inference and before import/receipt replay. In real local PostgreSQL, prove deny/rollback, same-generation concurrency, retry metadata survival and import receipt behavior. UI fixture success and SQL string assertions alone are insufficient concurrency proof.

Run the focused API/unit suites, then extend and run `node scripts/banner-studio/prove-dissection-jobs.mjs` **only in the later implementation task**. That runner owns a temporary loopback cluster and does not load `.env`; update its hardcoded old source baseline/output destination for this increment so previous evidence is not overwritten. The current planning task does not authorize running it.

## Task 3 — bounded transport and UI context

**Files:** add `server/runtime/banner-dissection-pages-guard.ts` and `test/banner/dissectionPagesGuard.test.ts`; extend `scripts/banner-engine-pages-guard.mjs` at its existing checked Pages transform. Update `DissectorModal.client.vue`, `useBannerDissectionJob.ts`, `test/banner/dissectionJobControls.test.ts`, `test/banner/dissectionImportControls.test.ts`, and the existing Dissector UI fixture runner. Keep engine guard limits/feature flag independent.

- [ ] Red/green request tests: reject over-limit multipart streaming bodies even with missing/false Content-Length; bound total body to 10 MiB + 64 KiB, non-file fields to 16 KiB, reads to 30 seconds and 65536 chunks; reject compressed/ambiguous-path requests. Gate the exact upload route before the installed Pages preset calls `arrayBuffer()`. Route-only multipart checks occur after buffering and do not prove this boundary. Preserve real native Request/context and rerun engine guard regressions. Apply a corresponding bounded read for the local Nitro route; do not consume the same stream twice.
- [ ] UI submits current saved `projectId` plus client assertion when present; unsaved client draft submits `clientId`; unsaved personal draft submits neither. Do not auto-save/create a project just to upload. Capture context at submit and invalidate pending response/history selection on project/client switch, close/reopen and navigation. Client/browser dimensions are preview only.
- [ ] Add optional A4 portrait/landscape selection using Nuxt UI with `UFormField` and full-width controls. Before editing form fields load the project's required frontend-design skill. Show server dimensions and explicit physical intent after upload; default physical size to unknown. Never auto-select A4 from image aspect ratio or imply 300-dpi source detail.
- [ ] Retain `expectedAttemptId`, lost-retry-response readback, no automatic POST replay and one-undo import receipts. On access loss clear stale layers/URLs/import eligibility rather than merging a denied poll with previously verified content. Do not silently resubmit as unbound after a scoped 403/409.

Task 3 transport limits are required before claiming safe public ingress. UI ownership controls remain gated until Task 2 and the result-delivery gate below are satisfied. Updating upload MIME copy in Task 1 does not require turning on scoped admission.

## Concrete blockers and deliberately separate work

1. **Result bytes are not currently protected by live project/client access.** `server/api/public/banner-assets/[token].get.ts` verifies a stable bearer capability containing asset ID, reads through cached `queryOne`, and has no session/client check. The source original is private, but `persistLayer` publishes derived bearer URLs; adding `client_id` alone does not revoke an already known URL. Before enabling client/project jobs, choose and implement authenticated job-bound source/result delivery with fresh ownership and `no-store`, or a separately authorized short-lived renderer capability that rechecks the same job. Normal rendering/export must be traced before selecting that transport. Never claim full R01/R12/A05 from the first slice. A migration for immutable asset-to-job provenance may be justified here as described above; it is not necessary for source identity.
2. **Runtime image limits need actual decoder/Pages evidence.** Real 2480 × 3508 fixtures, malicious PNG inflation/chunks, JPEG memory caps and the installed Pages prebuffer path must pass. Library presence, header probing and synthetic small images do not establish that acceptance. A failing A4 memory case blocks enabling that encoding; it does not block the first red tests or source-metadata work.
3. **Custom A4 import is still R07 work.** Current static-format-only import will not retain a custom A4 canvas. Preserve physical metadata in the job and do not claim save/export A4 acceptance; connect the existing `resolveBannerFormat` and document provenance in a distinct bounded increment with save/reload tests.
4. **Release evidence is separate.** No live auth, R2, Neon, queue, provider or release acceptance was performed here. Main reconciliation and coordinator CI remain mandatory. No provider questions or paid runs are needed to implement Task 1.

No user answer blocks this plan or Task 1. The decisions above are conservative implementation defaults; enabling scoped delivery and broader encoding/print claims depends on concrete implementation and verification, not guessed permission.

## Next implementation order and handoff

1. Reconcile the coordinator's implementation branch/source without touching the running release candidate; replace synthetic upload fixtures and implement Task 1's validator → manifest preservation → byte verification in that order. Zero DDL, no ownership-policy expansion.
2. Implement Task 2's fresh authority helper and its revocation tests before accepting project/client fields. Preserve original job/attempt/import authority.
3. Complete Task 3's entry guard and context-aware UI; resolve the result-delivery dependency before enabling scoped jobs. No global asset URL rewrite as an incidental upload fix.
4. Run focused tests once, then necessary PostgreSQL/browser/runtime acceptance. Re-read all changed files before any commit. Update canonical R01/R12 evidence and the relevant `app/pages/features/index.vue`, `app/pages/features/[slug].vue` and `MarketingNav.vue` only to describe proven functionality. Do not advertise client-owned or A4/print completion while the listed gates remain open.

Review focus is the five tested failure classes above: hostile decoded bytes; source metadata loss/spoofing; revoked/stale ownership; duplicate/ambiguous job delivery; and stale UI/import context. First-slice completion means valid original bytes and trustworthy persistent metadata, with existing job semantics intact. Full owned-ingestion completion additionally requires fresh lifecycle authority and protected source/result delivery.
