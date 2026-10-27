# Banner Studio dispatch recovery — independent review

27 October 2026. Reviewer task `task_6087f0cf6953`, dispatch `ctx_1924e6a65b68`, Orca Run `run_666e5ba6039d`.

**Accepted for the bounded local dispatch-outbox/recovery increment. No blocking finding remains in this scope.** Actual PostgreSQL tests prove persisted dispatch intent, lease-based redelivery of the same provider generation, bounded transport reservations, and cancellation/result/import fences. This extends [ASYNC-JOBS.md](ASYNC-JOBS.md) and [ASYNC-JOBS-REVIEW.md](ASYNC-JOBS-REVIEW.md); their absence-of-outbox limitation is superseded for newly recorded version-1 intents. Hosted scheduler/queue activation, Neon behavior, remote provider execution and full creative reconstruction remain unverified.

The coordinator supplied HEAD `d4560047ae045e14d337ccf062055dce83692fcb` including current main `4a68e92367fbcffd08a3f6a6a6e4537c71195937`. This worker performed no Git, deployment, production or provider operation and did not independently verify that baseline. The dirty source hashes below identify the actual reviewed files. Existing application work and parent checkout were preserved; edits are limited to the owned PostgreSQL test, disposable proof runner and this report, plus generated local evidence.

| Boundary | Independent result |
| --- | --- |
| Durable intent and clocks | Initial queued manifests and explicit retries persist version-1 dispatch intent with stable generation delivery identity and zero reservations. The actual upload handler and retry SQL still admit queued work with the application clock forced to January 2000: PostgreSQL owns the ten-minute deadline and scheduling timestamps. |
| Crash before send | Recovery finds committed pending intent. A reserved lease with no queue send remains unavailable until its persisted lease/backoff is due, then gets a new transport identity without changing provider generation, attempt number or deadline. A synthetic lost database acknowledgement after a real committed reservation returns 503 and sends nothing immediately; later recovery succeeds. |
| Lost acknowledgements | Accepted-send rejection leaves queued uncertainty and never invokes inline inference. Actual recovery redelivers the same generation; twelve concurrent deliveries of the two transport messages claim the provider once. Lost dispatch acknowledgement before and after its SQL commit both recover after the persisted delay. These faults are injected at the database adapter boundary, with actual SQL executed for the committed branch. |
| Consumer success before acknowledgement | Completed results and succeeded transport ledger rows remain unchanged after repeated scheduler passes and late failed acknowledgement. The dispatcher also preserves success when a synthetic send invokes a consumer and then rejects. |
| Concurrent schedulers | Twelve concurrent scheduler passes partition seventeen actual database rows using bounded batches. Each row receives exactly one current lease and send. Repeated passes before due time do not resend. SQL uses row locks and SKIP LOCKED, then repeats authoritative eligibility predicates in UPDATE. |
| Stale lease acknowledgement | An expired lease cannot acknowledge even before replacement. Old lease tokens cannot acknowledge success or failure over a newer lease; a previous generation cannot alter an explicitly retried generation. |
| Cancellation, import and deadline | Cancelled rows and imported receipts remain byte-for-byte equivalent at the returned-row level after recovery and stale acknowledgement attempts. Overdue queued/running version-1 jobs become failed without inference; late provider writes remain fenced. Legacy rows without known recovery metadata are left untouched by the scheduler. Existing concurrent receipt, revision, owner and rollback tests continue to pass. |
| Transport/provider bounds | Five transport reservations exhaust the generation's dispatch budget without incrementing provider attempts. Exhaustion leaves queued state until cancellation or original deadline; it does not start a new generation. Explicit retry resets transport reservations and increments the separately capped three-generation counter. A crash before queue.send can consume a reservation, so sendCount is a reservation budget, not a receipt count. |
| Claim before provider | Recovery never adopts analyzing/segmenting work. A crash after the durable claim but before provider invocation remains unknown running work until expiry and explicit retry. Concurrent recovery also starts no new send while a real pipeline waits on a provider stub; cancellation fences its eventual result. |
| Cron and execution capability | The actual endpoint enforces CRON_SECRET before disabled status, requires the literal activation string true and returns aggregate fields only. Source and focused tests confirm missing/empty deployed binding keys do not inherit process.env values; local fallback applies only when the Cloudflare env bag is absent. No queue means recovery performs neither mutation nor inline execution. Direct lifetime execution is restricted to development/test loopback requests; production and hosted-host negative SQL tests start no provider. |

Early review identified the shared platform producer upsert as a terminal-ledger regression risk if redelivery reused its identity. The implementation now keeps a stable generation deliveryId but uses each persisted leaseToken as its distinct transport ledger identity, and its producer uses INSERT ON CONFLICT DO NOTHING. Recovery never uses the shared unconditional dispatch-failure update after an uncertain send. This protects earlier transport rows; it does **not** fix existing same-message redelivery behavior in shared consumer start/finish ledger helpers. That ledger remains observational and cannot authorize provider work.

The coordinator also identified and the server owner fixed Cloudflare-binding fallback before final verification. Authentication and activation now use an existing binding bag as authoritative, including missing keys. Neither issue remains blocking in the final reviewed implementation.

Final local proof: **43 PostgreSQL cases passed**, finished `2026-10-26T23:57:43.882Z`, using **postgres (PostgreSQL) 14.19 (Homebrew)**. **134 focused tests passed across 12 files** in two non-overlapping commands (109 dispatcher/jobs/API/queue/ledger/UI controls plus 25 pipeline/import controls). Scoped ESLint passed for the owned test and runner. The coordinator's separate regression log was read and records **914 passed / 5 skipped** across 105 passing / 4 skipped files; it overlaps this suite and is not added to the independent count. Global build/typecheck and complete repository tests were not independently run.

Reproduce the actual database proof with:

```sh
node scripts/banner-studio/prove-dissection-jobs.mjs
```

The runner creates a fresh private loopback cluster, random database and per-run ownership token, never reading .env or using DATABASE_URL. Before schema mutation the test verifies protocol/host/port/user, private ownership marker, token, database name, current_database() and the server's actual data_directory. Existing migrations 034, 300 and 305 execute only in that owned cluster with minimal synthetic dependent tables. Application SQL and real BEGIN/COMMIT/ROLLBACK, row locks and concurrent connections run through pg; auth, HTTP input, queue transport, storage and provider boundaries remain synthetic. Clock-based redelivery tests age only fixture timestamps. No hosted scheduler or real remote provider was invoked, and injected commit-acknowledgement faults do not reproduce Neon/Hyperdrive network retries.

Final cluster `/private/tmp/banner-jobs-proof-cIpXlC` on `127.0.0.1:55691` was stopped and removed. The final verification separately checked that its directory is absent and its port is closed. A negative ownership invocation rejected a non-loopback URL before pool construction, with all 43 database tests skipped. Source hashes remained unchanged during the proof and matched again afterward.

Evidence is preserved separately from the prior async increment under `output/editable-artwork-recovery/`:

- `postgres-proof.json`, `postgres-proof.log`, `postgres-runner.log`: final real SQL results, all source hashes and cleanup.
- `focused-review-tests.log`, `focused-pipeline-import-tests.log`: independent focused results.
- `reviewer-lint.log`: clean scoped lint; `ownership-refusal.log`: expected guard rejection.
- `final-source-check.json`: post-proof hashes, owned-directory absence and closed port.
- `coordinator-regression.log`: separate coordinator regression evidence.

Full source hashes, including related tests, pipeline, ledger, API routes and schema, are in postgres-proof.json. Key reviewed files:

| Source | SHA-256 |
| --- | --- |
| `server/utils/banner/dissectionJobs.ts` | `94273074646c4345312d48a5b3fdeb3a97b51ae6ae4988365e1e67ed7380382e` |
| `server/utils/banner/dissectionDispatch.ts` | `ddef30e4633795ca6d590f09e5125981f14ebdd53abc38632fad9c3edb8b9254` |
| `server/utils/banner/dissectionRecovery.ts` | `91d36717c0f37deffcf5b2faf01e83c9c0e91e8c8f8835c3dbd9a2f513ea7a84` |
| `server/api/cron/banner-dissection-recovery.post.ts` | `cc6f1a74023c8f6f0871c66c74d3d361362b6017789d4c95ac34b28d380c4a80` |
| `server/api/agency/banner-studio/dissect/upload.post.ts` | `3cf22b472f321a149c5fa8f84857b5e16792d27c13934722634340557db3d7b6` |
| `test/server/utils/dissectionJobsPostgres.test.ts` | `64779a91007335380c9a45946b2d3e5214029980bdb55d1b7ebdf8546d76dc74` |
| `scripts/banner-studio/prove-dissection-jobs.mjs` | `6c11a87b368278fdfeaaabfd944d7dab471c3262e711e17984d445dd52021419` |

The persisted dispatch lease lasts 60 seconds. Acknowledged/uncertain sends use exponential backoff beginning at 15 seconds and capped at 120 seconds; an unacknowledged lease schedules retry after lease duration plus backoff. A pass may expire up to 20 known overdue rows and lease up to 20 eligible queued rows. Recovery preserves the original ten-minute provider-generation deadline and stops after five transport reservations. The feature is default-off, and deployment/trigger configuration is outside this proof.

Queue transport and SQL cannot commit atomically. A previously selected sender can finish late after cancellation, lease expiry or provider claim; downstream generation/status/deadline predicates prevent a second provider claim and stale result admission. The response field acknowledged counts queue sends whose transport returned successfully (with no acknowledgement-persistence exception); if a consumer already claimed the row, its queued-only acknowledgement can be a no-op. It is not proof of persisted dispatch state, provider completion or user-visible success. Queued/uncertain ledger entries can likewise remain after an unaccepted send.

No automatic recovery of unknown running provider work, remote provider cancellation/refund, absolute dollar-cost guarantee, hosted scheduler/queue/Neon acceptance, deployment/publication, complete flyer reconstruction, vector or print acceptance is claimed. Later explicit retry can overlap an earlier remote call that is still finishing. Prior managed-QR/native-lettering/browser evidence remains separate; this review added no new browser or creative-quality proof. The bounded local increment is complete while broader R12 and release gates remain open.
