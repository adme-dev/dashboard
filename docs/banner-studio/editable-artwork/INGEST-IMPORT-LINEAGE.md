# Protected canvas import lineage — R2

Verified locally on 28 October 2026 with Node v24.18.0 and the owned disposable
PostgreSQL 14.19 loopback runner. This is import-route acceptance, not hosted,
provider, browser, build, or release acceptance.

## Problem and resulting behavior

The import route previously checked the incoming dissection's authority but did
not authorize source dependencies already saved in the destination canvas.
Replacing a format could erase its protected source marker, and adding a format
could produce a canvas containing another uploader's protected source.

The route now authorizes every existing protected dependency through the shared
`assertScopedCanvasAccessInTransaction` helper and checks
`assertScopedCanvasLineage(previous, next)` before an overwrite. Missing,
malformed, revoked, or foreign-uploader dependencies reject without changing the
project or import receipt. An overwrite that removes the last retained source
marker rejects with 409. Existing managed QR protection remains in force.

Legal imports remain supported: another format may retain the existing protected
source alongside the incoming source, and replacement may retain the identical
source marker. These operations require current authority to every saved source
and the destination. Legacy unprotected imports continue through their existing
ownership, review, revision, QR, and receipt checks.

## Transaction and lock ordering

The import uses one `transactionWithoutRetry` callback, with no provider, storage,
or public effects inside it:

1. Read an unlocked destination snapshot. For a new-project request being
   replayed, discover the imported job's target using an unlocked job lookup.
2. Parse the saved markers and locators with the shared bounded collectors.
   Collect the union of their source job IDs and the incoming job ID, then take
   all job `FOR UPDATE` locks in sorted order. Missing dependencies fail closed.
3. For receipt replay, refresh the destination snapshot after the incoming job
   lock: another request may have completed the import while this one waited.
   Reject with 409 if that snapshot introduces a job outside the already-locked
   union. Do not acquire a new source lock to accommodate it.
4. Authorize the saved canvas through the shared helper. Its repeated job selects
   refer only to jobs already locked in step 2. Authorize the incoming job and
   resolve its frozen ownership and the current target authority.
5. Call `assertScopedProjectUnchanged` to lock and compare the destination's
   canvas, client, creator, and timestamp against the authorized snapshot.
   Concurrent edits reject with 409 before mutation.
6. For a fresh import, validate the reviewed result and revision, retained asset
   provenance, source lineage, and QR transition, then atomically write the
   project and receipt. For an exact replay, return the original receipt after
   current dependency/target authorization and the snapshot fence.

The preflight snapshot is discovery data, never authority. New dependencies
found after the source-lock phase require a fresh request; they never cause late
job locking. Receipt replay does not compare the current project revision with
the original import revision, so later legitimate edits preserve exact replay.

## Verification

The first PostgreSQL regression run reproduced seven failures against the prior
route: six invalid imports succeeded, and a receipt remained readable after a
saved dependency changed uploader. All 59 pre-existing tests passed in that run.

Final commands and results:

```sh
node /private/tmp/banner-owned-jobs-proof.mjs
# 73 passed: the original 59 plus 14 import lineage regressions.

pnpm exec vitest run test/server/api/bannerDissectionReadiness.test.ts \
  test/server/utils/bannerScopedCanvasAccess.test.ts \
  test/server/utils/bannerDissectionAccess.test.ts --reporter=verbose
# 79 passed, 16 skipped; readiness alone remains 27 passed.
```

The 16 skips are the existing opt-in repository-schema PostgreSQL cases in
`bannerDissectionAccess.test.ts`; `BANNER_DISSECTION_ACCESS_PROOF_URL` was not
supplied. The 73-test jobs proof independently runs actual SQL against its own
newly created cluster, never an application `DATABASE_URL`.

Added PostgreSQL coverage includes:

- Foreign uploader, stale session authority, malformed or missing dependency,
  replaced or malformed saved marker, malformed saved locator, and source erasure:
  denial with unchanged project and incoming job/receipt rows.
- Authorized additional source in another format, identical-source replacement,
  exact replay after later edits, and denial after dependency authority changes.
- Observed sorted source-lock union before authority, with no new source locks
  after authority begins.
- Deterministic concurrent canvas replacement between preflight and lock/fence,
  preserving the concurrent edit and leaving the incoming job unchanged.
- Newly discovered replay dependency returning 409 without locking that job or
  modifying the original receipt.
- Eight concurrent scoped new-project imports producing one protected project
  and one identical receipt.

The final proof completed at `2026-10-27T21:28:24.961Z`, with exit code 0,
`sourcesUnchangedDuringProof: true`, `ownedClusterStopped: true`, and
`cleanedUp: true`. Generated runner artifacts are
`output/editable-artwork-owned-ingestion/postgres-proof.json` and
`output/editable-artwork-owned-ingestion/postgres-proof.log`; these are overwritten
by future runner executions. This run's additional logs are
`/private/tmp/banner-import-lineage-red.log`,
`/private/tmp/banner-import-lineage-green.log`, and
`/private/tmp/banner-import-lineage-unit.log`.

Source hashes recorded by the final proof:

| File | SHA-256 |
| --- | --- |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | `5a1e19d4d899ccd539a727872616ce7c729b8bfb83e775f3567a7e4ac3d10154` |
| `test/server/utils/dissectionJobsPostgres.test.ts` | `f4589793c01efd9bb6a973ed1c1fee82f4f283dbd8997996e3e7641ff74ba85f` |
| `test/server/api/bannerDissectionReadiness.test.ts` | `d2859d0fcc3a89c00bd552e97842360510b82a5f5ef8f41c89ef9aee4fb26391` |

Only the three files above and this report were edited by the R2 import worker.
The readiness DB double now understands the shared snapshot-fence query aliases;
its ordering assertions distinguish unlocked preflight reads from project locks.
No Git, sibling workspace, build, deployment, live database, or provider operation
was performed. The runner's embedded historical baseline is unverified metadata,
not a current-branch claim. Integration and candidate-wide review remain with the
coordinator.
