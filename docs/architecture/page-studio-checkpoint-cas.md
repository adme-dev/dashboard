# Page Studio guarded checkpoint commits

Status: paired save-safety implementation, 7 September 2026. Not deployed;
authenticated staging remains required. With user approval, the isolated branch
`fix/page-studio-production-save` is based on the actual live release
`2793d65f7b26a6f8455964f78ec0e97fafaad0d0`, not the divergent main branch.
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
  using exact paired artifacts before separately authorized production deployment.

No marketing capability is added: these protections are not yet available to users.
No migration, production database, provider, token lifetime, DNS or unrelated
Dashboard/TikTok changes are included.

## Verification

Latest production-based local evidence (7 September): 83 tests pass, including
17 disposable PostgreSQL cases, AI acceptance and strict endpoint tests. The real
database cases include legacy/first-guarded contention in both lock orderings,
permanent activation after manual/AI saves, and exact AI replay receipts. Nine
deployment-guard tests pass. Focused strict TypeScript passes on this release base.
Full application build/static checks and authenticated staging remain separate
gates; the evidence below records the earlier main-based preparation only.

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
