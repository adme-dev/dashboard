# Page Studio guarded checkpoint commits

Status: additive backend/client preparation, 6 September 2026. Not deployed and
not a completed fix for live cross-tab saves. Dashboard base: `b442ae430b846da7cc66249f9d22242d478d6816`.
Paired Studio work: `fix/studio-save-reliability` (draft PR 37).

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

## Rollout holds

The old `POST /checkpoints` contract remains unchanged. Old browser/Worker
consumers are still unguarded; this endpoint's existence does not protect them.
The new Studio `commitCheckpointIfCurrent` method is opt-in and never falls back
to a legacy write on 404, 409 or dependency failure.

Before adopting this protocol:

- Carry the hydrated checkpoint ID through the editor, including initial empty state.
- Retain immutable operation identity across timeout, retry and session renewal.
- Reconcile ambiguous commits and superseded receipts without discarding newer drafts.
- Bind AI acceptance to revision identity as well as content digest.
- Fence delayed shared-sandbox hydration so an older request cannot overwrite a newer preview.
- Define a coordinated old-client cutoff or per-site protocol fence before claiming
  universal protection. A coordinated rollback must not silently re-enable unsafe writes.
- Prove authenticated staging save/reload, cross-tab contention and AI/manual flows
  using exact paired artifacts before separately authorized production deployment.

No marketing capability is added: these protections are not yet available to users.
No migration, production database, provider, token lifetime, DNS or unrelated
Dashboard/TikTok changes are included.

## Verification

- 65 focused Dashboard tests pass across nine files. Eleven tests use disposable
  PostgreSQL 17, separate connections and observed lock waits, including two writers,
  identical retries, stale initial state, same-digest/new-ID changes, superseded
  receipts, changed retry identity, foreign scope, both AI/manual race orders and
  real audit-trigger failure with full rollback and subsequent retry.
- Existing migration 402 applies twice against the synthetic database. No application
  database or `.env` was used. The CAS suite rejects non-local or non-test database URLs.
- Disabling only the new base comparison makes the real two-writer test fail with
  two successful writes. Restoring the comparison returns the focused suite to green.
- Changed-file Nuxt ESLint rules pass using a temporary standalone config. The sparse
  checkout reuses installed dependencies and does not generate a full Nuxt application.
- Focused strict TypeScript reports three existing `Pool.connect` overload errors in
  unchanged `server/utils/db.ts:375`, `:380`, `:382`. A db-only baseline reproduces the
  same errors. No clean Dashboard typecheck or production build is claimed.
- Independent read-only review found no critical/important issues. Its extra Studio
  receipt-binding test is included. Full Dashboard CI/build and live acceptance remain gates.

Run in a fully prepared checkout with a disposable local database:

```sh
PAGE_STUDIO_DATABASE_TEST_URL=postgresql://test_user@127.0.0.1:55439/page_studio_checkpoint_cas_test \
  pnpm exec vitest run test/config/pageStudioCheckpointCasPostgres.test.ts
```

The suite creates and drops only generated synthetic schemas. Do not point this
command at an application database, even if it runs on localhost.
