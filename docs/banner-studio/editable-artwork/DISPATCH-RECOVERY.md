# Interrupted dispatch recovery

27 October 2026 continuation of [asynchronous jobs](ASYNC-JOBS.md). This increment addresses saved, queued attempts that never reached a consumer. It does not automatically retry failed provider inference.

## Source and ownership

Fresh origin/main `4a68e92367fbcffd08a3f6a6a6e4537c71195937` is included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb` (ahead one, behind zero). Correct remote: adme-dev/dashboard. No rebase needed; all dirty implementation and the parent checkout remain preserved.

Orca Run `run_666e5ba6039d`:

- Implementation: task `task_a196ddab326b`, dispatch `ctx_6976cff842ce`; server dispatch/recovery, upload timestamps and dedicated tests.
- Independent review: task `task_6087f0cf6953`, dispatch `ctx_1924e6a65b68`; actual local PostgreSQL proof, runner and RECOVERY-REVIEW.md.
- Coordinator: integration, documentation, regression checks and Orca card.

Both workers inherit configured Codex defaults. Launch receipts contain no explicit model/effort identity; none is inferred. Ownership is disjoint.

## Implemented contract

Persist versioned delivery intent in the existing job manifest when the initial or explicitly retried generation is saved. A database lease admits a bounded delivery of that same unstarted generation. Recovery requires the queue binding and never falls back to inline inference. A new provider generation still requires the existing owner-authorised explicit retry.

Keep a stable intent identity per generation and a separate ledger identity per transport send. The shared producer ledger upsert resets existing rows, so recovery must avoid reusing that upsert to regress a running or completed delivery record. The exact-generation queued execution claim remains the authority for starting provider work.

Recover crashes before send, lost acknowledgements and expired delivery leases. Do not reclaim running inference or cancelled/imported/terminal generations. Preserve the original deadline, cancellation fences, three-attempt provider budget and result/revision-bound import. Transport deliveries have their own finite budget and backoff. Legacy records without versioned intent must not be silently executed.

The new cron endpoint requires a secret even locally and a separate default-off feature flag. An existing Cloudflare binding bag is authoritative, including missing values; it cannot inherit a secret or enablement from local environment variables. No live scheduler or flag is activated by this work. Direct request-lifetime fallback is now restricted to development/test on loopback hosts; production and public-host requests require a queue.

## Operating boundary

`POST /api/cron/banner-dissection-recovery` requires `x-cron-secret`, the configured `CRON_SECRET`, `BANNER_DISSECTION_RECOVERY_ENABLED=true` and the existing `JOBS_QUEUE` binding. An authenticated disabled invocation returns `ran: false, reason: disabled`; missing queue returns `queue_unavailable` without claiming or expiring rows. The response contains aggregate counts only. Queue acknowledgement counts describe transport acceptance, not completed artwork or provider success.

The implemented bounds are 20 rows per lease batch and 20 per expiry batch, 60-second leases, at most five transport reservations per generation, and 15-second exponential backoff capped at 120 seconds. Unacknowledged leases wait for lease expiry plus backoff. Transport exhaustion leaves the job queued until its original ten-minute deadline; it never resets that deadline or creates an inference attempt. Explicit provider retries retain their separate maximum of three generations.

For future hosted acceptance, verify the exact deployed source, bindings and authenticated scheduler, then use an authorised owned job to demonstrate saved intent, transport acceptance, one execution claim and final saved status separately. Monitor aggregate recovery failures and queued age. Disabling the recovery flag stops subsequent recovery passes; it does not retract an accepted queue message or cancel an already running provider call. No scheduler configuration is included in this local increment.

## Verification and limits

Coordinator regression passes **914 tests / 5 skipped**, across 105 passing and four skipped files. Scoped server/test and marketing lint and diff whitespace checks pass. Logs are in `output/editable-artwork-recovery/coordinator-regression.log` and `coordinator-lint.log`. The server worker reports 105 focused tests across nine files. These counts overlap and are not summed. No browser UI flow changed; earlier actual Nuxt fixture evidence remains in ASYNC-JOBS.md. Global build/typecheck was not rerun and is not claimed clean.

Independent SQL proof passes **43 cases** in an owned local PostgreSQL cluster. The receipt records `passed: true`, unchanged source hashes during proof and successful cluster cleanup. Coordinator independently checked every recorded source hash against the current files with no mismatch. The [independent review](RECOVERY-REVIEW.md) accepts this bounded local increment with no remaining blocking finding and records 134 passing focused tests across twelve files. These overlap the coordinator suite and are not added. Evidence belongs in `output/editable-artwork-recovery/`; earlier async/browser/SQL artifacts remain unchanged. The PostgreSQL runner owns a disposable loopback cluster and never uses the project's database credentials. Tests cover simultaneous recovery, expired leases, uncertain acceptance, cancellation, expiry, transport exhaustion, explicit retry and stale acknowledgements.

Local SQL proof uses synthetic queue/provider boundaries. It cannot prove hosted cron scheduling, Cloudflare delivery or Neon configuration. Request-lifetime fallback remains host-bounded. The shared queue consumer's same-message observability updates are outside this scoped recovery change; ledger status is not proof of a second provider start. No provider abort/refund, absolute cost ceiling or full reconstruction quality claim follows from recovery.

No merge, deployment, client publication or purchase. Automatic clean-background repair, live provider acceptance, four-side reconstruction and print acceptance remain open.

## Settlement

Both implementation and independent-review tasks succeeded and their workers were released with transcripts archived. Coordinator evidence is `output/editable-artwork-recovery/coordinator-evidence.json`. The owned database is removed, Orca reports no workspace listener, and all source remains local/uncommitted. The card is in review; the complete PRD and hosted release remain open.
