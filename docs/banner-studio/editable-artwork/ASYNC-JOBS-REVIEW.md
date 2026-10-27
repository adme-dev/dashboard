# Banner Studio asynchronous jobs — independent review

27 October 2026. Reviewer task `task_eac2082bcfd1`, dispatch `ctx_1b04a4162242`, Orca Run `run_666e5ba6039d`.

**Accepted for the local asynchronous increment. No blocking finding remains in the reviewed scope.** Retry now reserves a queued generation and returns after dispatch admission without awaiting provider completion. Initial upload and retry share an attempt-bound dispatcher; cancellation, stale-generation protection and transactional import receipts remain intact. This is not full R12 durability, hosted/provider acceptance, deployment or reconstruction-quality certification.

This review continues [JOB-RELIABILITY-REVIEW.md](JOB-RELIABILITY-REVIEW.md). Its synchronous-retry and unregistered-dissection-fallback limitations are superseded by this increment; its other evidence boundaries remain. Supplied baseline HEAD is `d4560047ae045e14d337ccf062055dce83692fcb`, including main `4a68e92367fbcffd08a3f6a6a6e4537c71195937`. The coordinator verified the branch baseline; this worker performed no Git, remote, production or provider operation. Current dirty-source hashes below identify the actual reviewed implementation.

## Findings and disposition

| Boundary | Independent result |
| --- | --- |
| Retry reservation | Twelve concurrent SQL retry requests admit one fresh queued generation, increment the count once, preserve the three-attempt bound and reject other owners/stale expected generations. A delayed duplicate cannot consume another attempt after its replacement fails. Legacy failed rows with no execution object recover through a compare-and-set token and one fresh generation. |
| Dispatch admission and delivery | Twelve simultaneous SQL dispatch reservations produce one winner. Twelve concurrent calls to the real process endpoint produce one synthetic queue send and one persisted platform ledger row. Repeated actual consumer calls while a provider stub is pending invoke it once. Claims require the exact generation and retain its original deadline. |
| Cancellation and stale work | Cancellation before claim makes duplicate deliveries provider-free. Cancellation while actual pipeline analysis is pending prevents later segmentation/storage/result writes. Prior generations cannot claim queued retries, write results, fail the replacement dispatch or reopen imported work. |
| Ambiguous send | Review flagged the existing unconditional `markJobDispatchFailed` ledger update as unsafe after a send may have reached a consumer. The new dispatcher avoids that call after invoking send. Actual SQL proves completed dissection and succeeded ledger rows survive a subsequent synthetic send rejection; no inline fallback starts. If failure wins before claim, late delivery cannot revive that generation. |
| Failure races | Twelve claim-versus-dispatch-failure races each admit exactly one transition. Generation and queued-state predicates preserve running, complete, cancelled, newer and imported work against late dispatch failure. Uncertain reservation acknowledgement returns a content-free recovery error without sending or starting work, covered by focused dispatcher tests. |
| Request lifetime | Without a queue, the dispatcher registers a deferred promise before opening its execution gate. A retained pending provider does not delay the dispatcher response; cancellation still fences its eventual result. Absent or throwing lifetime registration starts no provider. Source inspection of the installed Nitro app and Cloudflare Pages adapter confirms forwarding from `event.waitUntil` to the platform context; this does not prove hosted longevity. |
| Import receipts | Concurrent imports still commit one project/receipt. Actual SQL receipt rejection rolls back project creation; stale revisions and unauthorized targets fail without mutation. A late dispatch failure, retry, dispatch reservation and queue delivery leave the entire imported row unchanged. Receipt replay preserves later project edits, and prior-generation result identity is rejected even for identical artwork. |
| UI | The coordinator's settled UI sends expected generation, polls the admitted job, permits cancellation without reopening, and performs one GET after a lost retry response instead of replaying POST. Focused tests cover cancellation latches, stale responses, another selected job, reviewed import and one undoable apply. The actual Nuxt browser artifact below was independently inspected. |

## Actual local PostgreSQL proof

Final run: **25 passed**, completed `2026-10-26T20:10:03.887Z` using **postgres (PostgreSQL) 14.19 (Homebrew)**. Source hashes were unchanged during the proof and were checked again before this report. The proof runner and test were reread; scoped ESLint passed.

```sh
node scripts/banner-studio/prove-dissection-jobs.mjs
```

The runner creates and owns a fresh loopback cluster, random database and per-run token. Before schema mutation, the test checks the private ownership marker, loopback URL, high port, random database name, token, `current_database()` and server `data_directory`. It applies existing migrations 034, 300 and 305 only inside that disposable cluster, with minimal synthetic dependent tables. No existing database or `.env` is used. A separate negative check rejected a non-loopback URL before pool creation.

Unchanged application SQL runs through `pg` with concurrent connections, actual row locks and `BEGIN`/`COMMIT`/`ROLLBACK`; predicates are not simulated. The proof imports the real job helper, dispatcher, process endpoint, pipeline, queue consumer, ledger and import endpoint. Auth/client policy, HTTP events, queue transport, request lifetime, storage and providers are synthetic boundaries. The completed-import inputs supply synthetic extracted layers; they do not establish provider reconstruction quality. Production Neon/Hyperdrive retry and ambiguous network-commit behavior are not reproduced.

Cleanup was verified: owned cluster `/private/tmp/banner-jobs-proof-TJnRLi` on `127.0.0.1:63582` was stopped, its directory removed and its absence checked. Earlier proof invocations also reported successful owned-cluster cleanup. No other database/runtime was stopped; the coordinator owns the separate browser server.

Evidence under `output/editable-artwork-async-jobs/`:

- `postgres-proof.json` — final result, source hashes, exact owned cluster identity and cleanup.
- `postgres-proof.log` and `postgres-runner.log` — 25 actual PostgreSQL cases and runner evidence.
- `focused-review-tests.log` — **122 passed across 12 files**; 25 PostgreSQL cases intentionally skipped in the ordinary process and executed separately above. Includes dispatcher/API/queue/ledger, pipeline/readiness/import and UI controls.
- `reviewer-lint.log` — clean ESLint exit for the owned test and runner.
- `ownership-refusal.log` — expected failing test invocation demonstrating refusal before connection.

The focused run preceded a two-line pipeline comment correction; the final PostgreSQL proof includes that correction. No behavior changed after the focused pass. Global build/typecheck and the complete repository suite were not independently run; broader coordinator regressions are separate evidence.

The reviewer also read the coordinator's retained summaries: `coordinator-regression.log` records 870 passing / 5 skipped tests across 102 passing / 4 skipped files, and `coordinator-process-tests.log` records 16 additional passing endpoint tests. These 886 coordinator passes are not added to the overlapping independent suite count.

## Reviewed source identity

Full hashes, including relevant tests, schema and the coordinator's browser proof script, are in `postgres-proof.json`.

| Source | SHA-256 |
| --- | --- |
| `server/utils/banner/dissectionJobs.ts` | `0d4b48fd57f816585f0d1bff27f5f9e739ba55dd9587f20dc3a73bb25ccf2cb8` |
| `server/utils/banner/dissectionDispatch.ts` | `8e62ca77987273cb73a82c85f7c415abe95e3535777df5484d164f5e4e2df3e6` |
| `server/utils/bannerDissectorPipeline.ts` | `ce30f089c901bfe30ecf844a75e1465f2532d7556022bd5bd531bed9a8987d58` |
| `server/api/agency/banner-studio/dissect/process.post.ts` | `6839d7d5bc76dabd07f105a389b73776e8e816268a323e6016388958d270c922` |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `d7a9c546d3a50cfab5276ab1ef56a539a54b73cf9df883ba9f5f262384c1b239` |
| `app/composables/useBannerDissectionJob.ts` | `5c74fd3445e2afcd9228eed776ba4c78ad1a8449b504453eba41daf11ac3c238` |
| `app/components/banner/DissectorModal.client.vue` | `4bd09c9452d6210db913445d4a82953ddb0187a176ef5ae815e5ced07e479093` |
| `test/server/utils/dissectionJobsPostgres.test.ts` | `f0b7b2e1b2e5e84b2465ca1702b8e1b587dfa147b0f6afa7e78075e1836e0ef4` |
| `scripts/banner-studio/prove-dissection-jobs.mjs` | `0cea047baf7fd1129a6fbe7ac93e9a874a284bafa9e571d0832dad472a0d7ac9` |

## Separate actual Nuxt browser evidence

The coordinator ran `scripts/banner-studio/prove-dissection-async-ui.mjs`. This reviewer read `output/editable-artwork-async-jobs/ui/evidence.json` (started `2026-10-26T20:06:46.727Z`), the proof source and the queued/cancelled-retry screenshots. The reviewable artifact is `output/editable-artwork-async-jobs/ui/review.html`.

The browser runs the actual Nuxt editor with intercepted synthetic auth, dissection/provider APIs and file-backed project fixtures. It records **one upload, two asynchronous retries, two cancellations, one import and four fixture saves**. Assertions include reopening without another upload, stale completion rejection after cancellation, reload of saved cancellation, queued-retry cancellation without closing the dialog, import duplicate prevention and one undo/redo/save/reload. There are zero page/console/fixture errors, external requests or live provider calls.

The supplied artwork SHA-256 is `d0c806aed9b85a283d9ef55f3348ab0fe0d64bad904531514c63ac33f5480a79`. The imported result is a deliberately small synthetic heading fixture; it does not represent full-flyer extraction. Browser evidence SHA-256 is `78b90489c6c662f7f1bfe3ec7fb4270ff5890ae9438d0a987e6628c6f0891ff2`. This browser fixture proof is separate from the actual PostgreSQL proof and is not an end-to-end hosted transport test.

## Remaining R12 and release limits

1. **Reservation is not a durable outbox.** A crash after retry/dispatch reservation and before queue acceptance can leave queued work stranded until access-triggered expiry, cancellation or explicit retry. There is no autonomous redispatch/scheduler recovery in this increment. The HTTP response still waits for database/producer admission, but does not await inference.
2. **Request lifetime is host-bounded best effort.** `waitUntil` registration is explicit; it is not equivalent to a durable queue executor or a guarantee that long provider work survives request/runtime termination. Hosted queue bindings, consumer execution, redelivery/dead-letter handling and Neon behavior remain unverified.
3. **Transport ledger remains observational.** Ledger helpers can swallow persistence errors. After an ambiguous send before claim, a platform job can remain queued while the authoritative dissection row records failure; this intentionally avoids falsely overwriting an already-delivered consumer's success. The dissection generation predicates govern inference and result admission.
4. **Cancellation and timeout fence application state.** They do not establish remote provider abort, refund, absolute dollar-cost limits or orphaned-asset cleanup. No automatic provider retry is introduced, but a later explicit generation can run while an earlier remote call is still finishing.
5. **Product/release acceptance stays separate.** No hosted durability, live customer identity/client configuration, provider quality/cost, production migration, deployment, publication, complete four-page reconstruction or print/vector acceptance is claimed. Full R12 and the broader PRD remain open.

The reviewer changed only `test/server/utils/dissectionJobsPostgres.test.ts`, `scripts/banner-studio/prove-dissection-jobs.mjs` and this report, plus generated local proof artifacts. Existing dirty application work and the parent checkout were preserved.
