# Reconstruction job reliability — local implementation

Historical first job-reliability increment. [ASYNC-JOBS.md](ASYNC-JOBS.md) supersedes the synchronous retry and unregistered fallback limits below; the original evidence remains retained.

27 October 2026. Continues the locally accepted native retail editor; does not replace its evidence. Stage 2 / R12 needs durable processing, cancellation/retry, and duplicate-import protection before automatic reconstruction can be trusted.

## Source and ownership

Correct repository: adme-dev/dashboard. Fresh origin/main `4a68e92367fbcffd08a3f6a6a6e4537c71195937`; reconciled HEAD `d4560047ae045e14d337ccf062055dce83692fcb`. Seven upstream Page Studio commits were reconciled with rebase/autostash before code work. All existing tracked/untracked implementation and the dirty parent checkout were preserved.

Orca Run `run_666e5ba6039d`:

| Task | Dispatch | Owner | Scope |
|---|---|---|---|
| `task_48fa0a4551bf` | `ctx_d77c737edcfe` | GPT-6.1 Sol high | Server claims, attempts, cancellation/retry, atomic import receipts and tests |
| `task_af6d08ca931d` | `ctx_f02c9f70d81f` | GPT-6.1 Sol high | Existing Dissector UI, resumable status, stale-response guards and tests |
| `task_7e8f00f70e5c` | `ctx_78bb4475f3fa` | GPT-6 Astra high | Independent review and isolated local PostgreSQL concurrency/rollback proof |
| Coordinator | Current session | Existing owner | Integration, actual Nuxt browser proof, documentation and card |

Requested/effective model and effort match in all three launch receipts. Workers have disjoint ownership. No migration, new queue system or production access is required for this increment: reuse existing `banner_dissections` status/manifest fields and job queue.

## Acceptance contract

- Persist an application-owned attempt identity and bounded explicit retries. Duplicate deliveries must not repeat provider work for an attempt. Old queued messages and late completions must not run or overwrite a newer attempt.
- Cancellation persists and blocks later result/import application; it does not promise to reverse provider charges or abort an already-running provider request.
- Preserve content-free failed/cancelled/progress evidence and resume it through the existing job/history routes. Closing a dialog does not cancel a server job or allow a late response into another session.
- Import records an atomic receipt bound to source result, target, options and expected saved revision. Replaying the same request returns its original result; changed intent or stale targets fail without partial writes.
- Continue rejecting incomplete extraction and absent clean backgrounds. This work does not fabricate layers or mark partial extraction complete.
- Protect existing managed QR, exact copy, user/client access and editor undo. Runtime provider outputs remain subject to the established review boundary.

## Evidence limits

Initial local presence check: no `.env`, and process OPENAI_API_KEY, GROQ_API_KEY and DATABASE_URL are absent (only booleans inspected). Local PostgreSQL binaries are available; the reviewer may initialize a disposable synthetic database, never use an existing database. Local SQL proof is distinct from hosted Neon and Cloudflare queue acceptance. Browser auth/provider/storage fixtures remain explicitly labelled. No merge, deployment, client publication, subscription purchase or automatic full-poster repair is included.

## Implemented behavior

The existing dissection table now holds application-owned attempts, progress, cancellation, a maximum of three explicit attempts and a ten-minute deadline for queued/running work. Status/process access expires abandoned work; generation and deadline predicates reject late writes. Queue deliveries carry their attempt identity and legacy unbound deliveries do not claim work. Failure evidence contains no provider response bodies. Extracted assets use attempt-specific keys.

Imports bind a canonical result digest (including attempt generation), original source, target format/options and saved project revision. Job and project locks serialize imports; project mutation and the import receipt commit in one transaction. The same request replays its original receipt without rewriting later edits. Changed intent, stale results/revisions, inaccessible targets and managed-QR removal fail closed. Invalid inherited format names are rejected.

The existing Dissector modal now lists saved analyses, resumes progress, cancels, explicitly retries and retains failed/cancelled findings. Late responses cannot revive cancelled jobs or alter another modal session. Existing-project import requires the saved reviewed canvas, records the receipt revision and creates one undo action. Marketing feature descriptions reflect this local preview without claiming hosted availability.

## Verification

- Actual Nuxt browser proof: `node scripts/banner-studio/prove-dissection-ui.mjs`. Passed with one upload, two explicit retries, one cancellation, one import and four fixture saves. Reopen/reload, stale-poll cancellation, failure detail, reviewed import, one undo/redo and reload all pass. Zero page/console/fixture errors, external requests or live inference calls.
- Reviewable browser artifact: `output/editable-artwork-jobs/ui/review.html`; machine evidence `ui/evidence.json`. This uses a deliberately small synthetic native-heading result, not a claim of extracting the uploaded full flyer. The input is the current leafy lifestyle back (SHA-256 `d0c806aed9b85a283d9ef55f3348ab0fe0d64bad904531514c63ac33f5480a79`).
- Independent PostgreSQL proof: `node scripts/banner-studio/prove-dissection-jobs.mjs`; evidence `output/editable-artwork-jobs/postgres-proof.json` and `.log`. It owns an ephemeral loopback database, uses actual application SQL and transactions with synthetic auth/provider inputs, records source hashes, and cleans up only its own cluster.
- Final coordinator regressions: 845 passed / 5 skipped across 99 passing / 4 skipped files, plus 6 passing queue/upload tests across two additional files (851 passing in total). Independent reviewer: 82 focused tests plus 14 actual PostgreSQL cases. The prototype-format regression initially failed and was corrected; the final broad rerun passes.
- Scoped source/test lint passes for the new helper, pipeline, APIs, component/composable and tests; root proof script and marketing lint pass. Shared types and queueConsumer retain pre-existing lint errors outside this increment. Global build/typecheck were not rerun; no clean global claim. `git diff --check` passes.

## Remaining R12 limits

Manual retry still awaits the processing request. During that wait, close/reopen resumes persisted progress and exposes cancellation once the server claim exists. The existing no-queue fallback starts work without a durable dispatcher or `waitUntil`; interruption may leave a job requiring expiry/cancel and explicit retry. Expiry occurs on access, not via a scheduler. Cancellation/deadlines prevent result application and later stages; they do not promise remote provider abort or refund. No automatic provider retry occurs. Absolute dollar-cost caps, hosted queue/Neon acceptance, automatic clean-background repair and the complete four-page reconstruction requirement remain open.


## Settlement

All three tasks succeeded and their workers were released after accepted reports, with transcripts archived. Governing review accepts only this local increment; see [JOB-RELIABILITY-REVIEW.md](JOB-RELIABILITY-REVIEW.md). Final PostgreSQL evidence hashes match the current reviewed helper, pipeline, import, UI and test sources. Coordinator logs are retained in `output/editable-artwork-jobs/coordinator-*.log`. All code remains local/uncommitted; the broader PRD remains open.

Final runtime checkpoint: the owned Nuxt server on port 3137 is stopped and the port has no listener. Orca inbox is clear, no workers remain reclaimable, and the card is in review. No other contributor runtime or database was stopped.
