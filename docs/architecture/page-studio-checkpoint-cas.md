# Page Studio guarded checkpoint commits

Status: reconciled onto freshly fetched current `origin/main`
`3f8675ed5b3f563a200b116d30a85d3051d49229` on 11 September 2026 in
`fix/page-studio-current-main`. Only the reviewed checkpoint protocol changes
from `13aaf46b3` and `1c2380c85` were applied; their divergent release lineage
was not merged. PR529 is merged as `3369a09edef497439d2e4ab7fa2e8e7b4828136d`.
The clean merged source was deployed to `agency-dashboard` as
`bee07364-2f1c-425f-9c9b-70d8b46ebcdf` at `2026-09-11T05:19:31.259329Z`.
Cloudflare's canonical production deployment was independently read back with
that source and `commit_dirty: false`.

The standalone Studio staging runtime already carries the guarded protocol.
Revalidate the paired authenticated save/reload and AI flows after Dashboard
release; do not treat historical evidence as verification of the new pairing.

## Contract and decision

`POST /internal/page-studio/checkpoints/commit` uses the existing machine-service
authentication. Its strict body is `{ checkpoint, expectedCheckpointId }`;
`checkpoint` is the existing immutable metadata contract. The required expected
ID is a checkpoint ID or explicit `null` for an empty site. The required
`idempotency-key` header must equal `checkpoint.checkpointId`.

The caller must retain the revision it actually hydrated. It must never fetch
the latest ID at save time and substitute that as its expected base. A logical
operation keeps the same checkpoint ID, timestamp, digest, object key, ETag,
scope, author and expected base on every retry.

The existing dedicated database transaction locks the exact tenant/client/site
row, checks immutable replay identity, then compares the expected head before
inserting a checkpoint, advancing the head and appending its audit. A mismatch
returns `CHECKPOINT_BASE_MISMATCH` / HTTP 409 without these writes. The existing
AI acceptance path locks the same site row; no second R2 or process-memory head
is introduced. This relies on PostgreSQL's [row-lock semantics](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS).

The existing append-only checkpoint audit stores `commitProtocol: "cas-v1"` and
`expectedCheckpointId`, including JSON null. This durably binds retry identity
without a migration or a second receipt store. A legacy checkpoint has no CAS
receipt; it cannot be replayed as a guarded operation. A changed base or changed
immutable metadata under the same operation ID returns `CHECKPOINT_CONFLICT` / 409.

Successful new commits and exact retries return:

```json
{
  "acknowledged": true,
  "checkpointId": "checkpoint_operation",
  "currentCheckpointId": "checkpoint_current",
  "isCurrent": false
}
```

`acknowledged` confirms the operation committed. `isCurrent` describes the head
observed while this transaction held the lock, not a guarantee after response
delivery. A superseded retry never rewinds the head or creates another audit.
Consumers must also bind the response to their pending local operation.

## AI acceptance and legacy cutoff

AI acceptance requires `expectedCheckpointId` as well as `baseDigest`. The site
lock checks identity before content, preventing same-content/new-ID ABA races.
The immutable checkpoint audit binds both original values. Exact retries return
the full checkpoint receipt plus the original `versionId`, even after approval,
rejection, publication or a newer checkpoint. Mutable review status is not part
of request identity; retries never rewind the head or reopen a review.

The legacy checkpoint endpoint remains available only before a site's first
`workspace.checkpointed` audit with `commitProtocol: "cas-v1"`. This activation
lookup scopes tenant, client and site under the same writer lock, and does not
depend on the current head or actor. After activation, all legacy writes,
including exact legacy retries, fail closed with HTTP 409. No migration is needed.

## Rollout holds

The paired Studio browser and internal Worker routes require stable operation
identity and the guarded base. They never fall back to legacy writes. AI jobs use
the actual admitted checkpoint ID, and acceptance replays against that immutable
R2 base rather than substituting a newer head. Immutable preview snapshots prevent
late hydration from replacing newer preview content.

This is a coordinated protocol upgrade, not a rolling-version-compatible change.
Old AI callers omit the required base; old Dashboard schemas reject the new field.
Deploy compatible Dashboard and Worker/container artifacts together, verify the
staging fixture, and handle already-open editors without discarding drafts.
Rollback must retain the guarded endpoint and permanent legacy fence; rolling
Dashboard back to unguarded code is not a safe data-integrity rollback.

Before adopting this protocol:

- Carry the hydrated checkpoint ID through the editor, including initial empty state.
- Retain immutable operation identity across timeout, retry and session renewal.
- Reconcile ambiguous commits and superseded receipts without discarding newer drafts.
- Bind AI acceptance to revision identity as well as content digest.
- Fence delayed shared-sandbox hydration so an older request cannot overwrite a newer preview.
- Define a coordinated old-client cutoff or per-site protocol fence before claiming
  universal protection. A coordinated rollback must not silently re-enable unsafe writes.
- Prove authenticated staging save/reload, cross-tab contention and AI/manual flows
  using exact paired artifacts before production release.

This repair restores the existing save contract and adds no new marketing
capability. It introduces no migration or change to customer content, provider
configuration, token lifetimes or DNS.

## Verification

Current-main reconciliation evidence (11 September):

- 66 focused unit and endpoint tests pass across five files, covering strict
  machine-authenticated requests, immutable receipts, stale bases, AI acceptance
  and permanent legacy cutoff.
- 18 real PostgreSQL 14.19 checks pass in the separate local disposable database
  `page_studio_checkpoint_cas_test_current_main_20260911`. These include 17 CAS
  cases and migration 402 application twice. No application database or `.env`
  was used; fixture schemas were removed after each test.
- The CI job now provisions a disposable PostgreSQL 17 service and runs these
  database tests explicitly, so the ordinary suite cannot silently skip this gate.
- Full Cloudflare production build passes: 25,423,836 raw bytes against the
  immutable 25,468,928-byte budget (45,092 bytes remaining); gzip 6,600,104 bytes.
- Changed-file ESLint and 32 AI/deployment-guard tests pass. Type checking with
  generated Nitro declarations reports 281 diagnostics across the wider imported
  application, with none in the changed files after correcting an outdated Vitest
  assertion generic. A clean full-application typecheck is not claimed.
- Full local suite: 13,064 passed, 44 skipped, one failed. The failure is the
  unchanged Lakebase recovery-sentinel case in `test/lakebase/pilotEvaluate.test.ts`:
  a contender returned `lakebase_evaluation_publish_failed` instead of the expected
  lock-unavailable error. It passes in isolation; the cause is not yet established.
  Both its test and `scripts/lakebase-pilot` match current main. Preserve this as
  an open regression item; do not describe the full local suite as green.
- Both PR CI runs (`34564411750`, `34564379523`) passed, including PostgreSQL 17,
  production builds and the full suite. The merge tree matches the tested source.
- Final deployed build: 25,423,800 raw bytes, 45,128 bytes remaining;
  gzip 6,600,212 bytes. Authenticated production reads preserved Fantasy Limo
  and the reference site, the QR sidebar, and the exact reported SVG download
  (HTTP 200, 23,286 bytes, matching the delivered Desktop file).
- Reference-site launch returned the parent buttons to an enabled state.
  The child editor tab was not inspected; authenticated deployed editor
  save/reload and AI acceptance remain unverified for this pairing.

The concurrency cases observe actual blocked database connections before
releasing competing transactions. They cover manual/manual, AI/manual and
legacy/first-guarded races, identical retries, changed request identity, foreign
scope, same-content/new-identity changes, and an audit-trigger failure proving
transaction rollback. A superseded retry cannot rewind the site head.

Run in a fully prepared checkout with a disposable local database:

```sh
PAGE_STUDIO_DATABASE_TEST_URL=postgresql://test_user@127.0.0.1:55439/page_studio_checkpoint_cas_test \
  pnpm exec vitest run test/config/pageStudioCheckpointCasPostgres.test.ts
```

The suite creates and drops only generated synthetic schemas. Do not point this
command at an application database, even if it runs on localhost.
