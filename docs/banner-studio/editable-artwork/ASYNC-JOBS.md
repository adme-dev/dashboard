# Asynchronous reconstruction jobs

27 October 2026 continuation of [JOB-RELIABILITY.md](JOB-RELIABILITY.md). The next R12 increment removes the blocking manual retry request and the Dissector's bare inline fallback. Existing reconstruction quality, native lettering, managed QR and print gates are unchanged.

## Source and ownership

Freshly fetched origin/main remains `4a68e92367fbcffd08a3f6a6a6e4537c71195937`; current HEAD `d4560047ae045e14d337ccf062055dce83692fcb` includes it. No rebase was needed. Correct remote is adme-dev/dashboard. All dirty implementation and parent work are preserved.

Orca Run `run_666e5ba6039d`:

- Server implementation: `task_749e5ca6e1d4`, dispatch `ctx_7dd2c4134386`.
- Independent SQL proof and review: `task_eac2082bcfd1`, dispatch `ctx_1b04a4162242`.
- Coordinator: existing Dissector UI/composable, browser proof, integration, documentation and card.

Both workers inherit the user's configured Codex model; launch receipts show no explicit requested/effective model or effort. No model identity is inferred. Ownership is disjoint; no production action or migration is planned.

## Contract and verification plan

Retry submits the reviewed attempt identity. A conditional database reservation creates one queued generation, increments the bounded attempt count once, and prevents delayed duplicate requests from silently retrying a later failure. Processing claims require the exact queued identity. Dispatch is separately reserved once, uses the existing queue/ledger, and never launches a second provider path after ambiguous queue acceptance. A no-queue fallback must be registered with the actual request lifecycle; missing capability must fail honestly.

The UI keeps its existing semantic Nuxt components, compact left-aligned status and action row. Submission, queued progress, cancellation and final review have distinct states. The old instruction to close/reopen during retry will be removed. A lost submission response triggers one read of saved state, not another POST; cancellation latches release only for a proven newer generation. Legacy jobs must remain recoverable through server-issued identity.

Meaningful tests cover concurrent reservation, cancellation before claim, dispatch failure/ambiguity, late delivery, lost-response recovery and one undoable import. Actual Nuxt browser evidence is written to `output/editable-artwork-async-jobs/ui/`; separate real local PostgreSQL evidence uses the owned disposable runner, never an existing database.

## Limits

Request-lifetime registration is not durable execution across process death, and local queue mocks do not establish hosted queue bindings or delivery. No provider abort/refund or absolute dollar-cost guarantee is implied. Live provider/Neon/Cloudflare acceptance, automatic clean-background reconstruction, four-side quality and print gates remain open. No merge, deployment, client publication or purchase.

## Local evidence

The lost-retry-response test first failed with the old cancelled state, then passed after one-read recovery was added. Twenty-five focused UI/import tests pass, including queued cancellation without reopening, generation-bound submission, late recovery after switching jobs, and cancellation retention on an old-generation response. Scoped UI/proof-script/marketing lint and diff whitespace checks pass. Logs are retained under `output/editable-artwork-async-jobs/`.

Actual Nuxt browser proof: `node scripts/banner-studio/prove-dissection-async-ui.mjs`. It passed with one upload, two asynchronous retries, two cancellations, one import and four saves, including progress updates and cancellation in the same open dialog, stale completion rejection, undo/redo and reload. Zero page/console/fixture errors or external/provider requests. The APIs, provider result and identity are synthetic fixtures; this small native-heading result does not claim full-flyer extraction. Review artifact: `output/editable-artwork-async-jobs/ui/review.html`.

The server worker reports 77 focused tests across seven files and scoped lint passing. Final coordinator regression passes 870 tests / 5 skipped across 102 passing / 4 skipped files, plus 16 passing process-endpoint tests in a separate non-overlapping command: 886 passed total. The independent reviewer passes 122 focused tests and 25 real PostgreSQL cases. The SQL proof records hashes and owned-cluster cleanup in `output/editable-artwork-async-jobs/postgres-proof.json`. Global build/typecheck were not rerun; existing shared-file lint limitations remain outside this increment.

## Settlement

Independent review accepts this local increment with no blocking finding; see [ASYNC-JOBS-REVIEW.md](ASYNC-JOBS-REVIEW.md). Server and review tasks both succeeded and their workers were released with transcripts archived. Final SQL proof hashes match the reviewed sources. The owned Nuxt server on port3137 is stopped with no listener; the disposable PostgreSQL cluster was removed. All implementation remains local/uncommitted.

The current queue/producer admission is asynchronous relative to inference, but is not a durable outbox. A crash between reservation and delivery still needs expiry/cancel/explicit retry. These remaining R12 limits are explicit in the review.

The subsequent [dispatch recovery increment](DISPATCH-RECOVERY.md) supersedes the local missing-intent/process-death gap above for unstarted versioned generations. It adds bounded queue redelivery and restricts direct lifetime fallback to loopback development/test. Hosted scheduling/delivery and provider acceptance remain unverified.
