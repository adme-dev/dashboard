# Banner Studio job reliability — governing review

27 October 2026. Reviewer dispatch `ctx_78bb4475f3fa`, task `task_7e8f00f70e5c`, Orca Run `run_666e5ba6039d`.

**Accepted within the local increment:** persisted attempts and progress, generation fencing, explicit bounded retry, cancellation and timeout admission, resumable UI, and transactional imports. No remaining blocking finding was identified within that scope. **Full asynchronous R12 remains open.** The coordinator expressly accepted the synchronous retry and runtime limitations below; this report is not hosted, provider, deployment or complete PRD acceptance.

The supplied source baseline is HEAD `d4560047ae045e14d337ccf062055dce83692fcb`, including main `4a68e92367fbcffd08a3f6a6a6e4537c71195937`. This worker did not access Git or remotes. Current dirty-file hashes, rather than the baseline alone, identify the reviewed code in `output/editable-artwork-jobs/postgres-proof.json`. Existing edits were preserved; this worker changed only the new PostgreSQL test, its runner and this report.

## Findings and disposition

| Boundary | Result and evidence |
| --- | --- |
| Concurrent execution | Twelve simultaneous queued claims produce one winner. Eight duplicate calls to the actual pipeline while analysis is pending invoke the stub provider only once. Queue delivery is bound to the original attempt ID. |
| Cancellation | A committed cancellation prevents subsequent segment/completion writes. The actual pipeline awaiting a provider returns the cancelled snapshot when the provider responds late. Import and cancellation serialize on the same job row; imported artwork cannot be cancelled through the job endpoint. |
| Retry | Explicit retry alone advances the generation; twelve simultaneous retry claims produce one winner. Three attempts are enforced by database predicates. Old writes and delayed queue deliveries cannot claim or overwrite a newer attempt. Provider-generated fields cannot reset attempt counts or forge receipts. |
| Timeout/crash | Review initially found no expiry. The server owner added a persisted ten-minute deadline, conditional expiry on load/claim, and deadline checks inside claim, active-check and write SQL. Expired queued/running attempts become failed without invoking a provider; late writes fail even before a poll records expiry. Explicit retry starts a fresh generation. |
| Reviewed result | Review initially found the import request was not bound to the reviewed generation. The server/UI owners added required `expectedResultId`, hashing canonical artwork plus attempt identity. Identical artwork from a later generation still rejects the older review. Canonical hashing survives JSONB key ordering. |
| Atomic import | Twelve simultaneous new-project imports return one project and one receipt. Eight existing-target imports mutate once. Project mutation, job linkage, imported status and receipt share one PostgreSQL transaction. A real SQL trigger rejecting the receipt write rolls back the inserted project. |
| Revision and replay | Stale target revision returns 409 with original artwork and no receipt preserved. Identical replay returns the original receipt without overwriting subsequent project edits. Changed intent is rejected. The final import source includes the own-property format guard covering the `toString` regression; layer overrides are separately constrained by the schema and converter. |
| Authorisation | Public endpoints require authentication/write access and constrain jobs by owner. Import locks and checks the target project; receipt replay rechecks current target access. Actual PostgreSQL tests prove job-owner predicates and exercise denied project access with a stub policy. These tests do not validate live identity/session or tenant membership configuration. |
| UI | Source review and focused tests cover fresh-result admission, cancellation latching, obsolete poll/selection/modal responses, captured saved revision and editor context, expected result identity, one undoable apply and receipt replay. The final help text explains the retry close/reopen workaround. |

## Actual local PostgreSQL proof

The final run completed `2026-10-26T19:57:16.888Z`: **14 passed**, source hashes unchanged during proof, owned cluster stopped and removed. Local binary: **PostgreSQL 14.19 (Homebrew)**. No existing database, `.env`, production provider or hosted service was accessed.

Run from this worktree:

```sh
node scripts/banner-studio/prove-dissection-jobs.mjs
```

The runner creates a private `/tmp/banner-jobs-proof-*` directory (canonical `/private/tmp` on this Mac), selects an unused high port, starts its own cluster on `127.0.0.1` with a private Unix socket, and creates a random database owned by `proof_owner`. Before schema mutation, the test verifies loopback URL, high port, random database name, per-run token, private marker location, `current_database()` and PostgreSQL `data_directory`. It then executes existing migration 034 only in this new database, with minimal synthetic `team_members` and `banner_projects` dependencies. All test data is synthetic.

The test imports the actual job helper, pipeline and import endpoint. Its database module shim forwards unchanged application SQL to `pg`, using real `BEGIN`/`COMMIT`/`ROLLBACK`, row locks and concurrent connections. It does not emulate SQL predicates. Authentication, provider/storage and HTTP event boundaries are stubbed. The successful-import fixtures deliberately supply extracted native layers; they are not evidence that a live provider reconstructed the supplied poster.

Normal Vitest runs skip all 14 database cases unless the runner supplies `BANNER_JOBS_PROOF_URL`, `BANNER_JOBS_PROOF_OWNER` and `BANNER_JOBS_PROOF_TOKEN`. Do not point these variables at an existing database. An explicit non-loopback negative check failed at the ownership guard before creating a connection, as intended.

Evidence:

- `output/editable-artwork-jobs/postgres-proof.json`: final status, cleanup and full source SHA-256 map.
- `output/editable-artwork-jobs/postgres-proof.log`: all 14 individual cases and the actual PostgreSQL-backed test result.
- `output/editable-artwork-jobs/ownership-refusal.log`: expected fail-closed negative check.
- `output/editable-artwork-jobs/reviewer-lint.log`: clean scoped ESLint exit for the new test and runner.
- `output/editable-artwork-jobs/focused-review-tests.log`: independently run focused regression suite, **82 passed across 9 files**, plus **14 intentionally skipped** PostgreSQL cases in the ordinary test process.

The final PostgreSQL proof hashes include:

| Source | SHA-256 |
| --- | --- |
| `server/utils/banner/dissectionJobs.ts` | `2389995862362bb38bfd817ac2cbf398fa8909dd76ace868c864d5e6d7aeb47e` |
| `server/utils/bannerDissectorPipeline.ts` | `fc4bc448f00d9d05beb38ceb068b424c189b9533029ce67468ce4b67e4688c55` |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `d7a9c546d3a50cfab5276ab1ef56a539a54b73cf9df883ba9f5f262384c1b239` |
| `app/composables/useBannerDissectionJob.ts` | `5f0645a55d4df042598160e172e1e9b2fcc978f0be9a407bcf247bb3b6eeaafc` |
| `app/components/banner/DissectorModal.client.vue` | `fde9cfb726276bf26b2fad57ba8c6f2ce836e035521165bd9c747e169b89a1f0` |

## Separate browser evidence

The coordinator ran `scripts/banner-studio/prove-dissection-ui.mjs`; this reviewer read `output/editable-artwork-jobs/ui/evidence.json`. It records a passing actual Nuxt editor flow with intercepted synthetic auth, dissection/provider APIs and file-backed project APIs: reopen without another upload; cancellation with a stale completion poll in flight; reload of the cancelled job; two explicit retries; reviewed import; one undo/redo; save/reload; and imported-state duplicate prevention. Counts are one upload, two retries, one cancellation, one import and four fixture saves, with zero page, console or fixture errors and zero external requests/live provider calls.

Coordinator addendum: the browser proof was repeated successfully after the final retry help-text addition; see the current evidence timestamp. Its source artwork SHA-256 is `d0c806aed9b85a283d9ef55f3348ab0fe0d64bad904531514c63ac33f5480a79`. This is UI fixture evidence, separate from the real local PostgreSQL transaction proof above.

## Remaining R12 and release limits

1. **Manual retry is synchronous.** `process.post.ts` awaits the pipeline; the modal's retry busy state disables Cancel until that request settles. Close and reopen to poll the persisted running attempt and cancel it. The UI now explains this workaround. A genuinely asynchronous retry dispatch remains future work.
2. **Inline fallback is not a durable executor.** Existing `queue.ts` starts `runInline` without awaiting it or registering `waitUntil`. Process/request death can abandon execution. The saved row and later expiry support explicit recovery; neither local tests nor the browser prove hosted queue binding, delivery, recovery or dead-letter operation.
3. **Timeout is admission and write fencing.** Expiry is recorded when a job is read/claimed, not by a timer service. History alone does not expire every row. Already-running provider/network calls are not physically aborted, charges are not refunded, and attempt count is not an absolute currency cap. A provider operation that outlives cancellation/expiry can leave an unreferenced asset; no garbage-collection acceptance is claimed.
4. **Exactly once is the database import effect.** The proof covers one committed project mutation and receipt per compatible job intent. It does not establish exactly-once provider execution, production transport retries, actual Neon/Hyperdrive connection behavior or ambiguous network-commit delivery. The test shim uses PostgreSQL transactions but does not reproduce the production driver's retry transport.
5. **Reconstruction and release remain separate.** Background reconstruction still yields review-only results until genuinely resolved. No live provider quality, hosted identity/client configuration, production migration, deployment, client publication, four-side reconstruction or print/vector acceptance is established here. The coordinator owns final broader regression/release accounting and requested/effective agent model receipts.
