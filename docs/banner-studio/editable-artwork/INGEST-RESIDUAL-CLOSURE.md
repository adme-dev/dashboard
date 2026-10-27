# Ingest residual closure — search probe and project lock upgrade

Date: 2026-10-28. Scope: the original `banner-editable-artwork` workspace only. This closes residuals 1 and 2 from `INGEST-REVIEW-CLOSURE.md`. Work was done on Node `v24.18.0` with source changes, focused unit tests and disposable loopback PostgreSQL clusters. No Git, build, deployment, live DB or provider, native canary, credentials or subagents were used. **This note does not certify hosted or full-PRD acceptance.**

## Files

| File | Change | SHA-256 before → after |
|---|---|---|
| `server/api/agency/banner-studio/projects/index.get.ts` | Search runs after redaction; pagination is validated | `64746f13…58d7` → `217d4a94…9dae` |
| `server/api/agency/banner-studio/projects/[id].delete.ts` | Project `FOR UPDATE` taken before authority | `5f18fa08…da9d` → `359b13b3…b022b34` |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | Target `FOR UPDATE` taken before authority | `5a1e19d4…0154` → `74f5a285…cce2b7` |
| `test/server/api/bannerProjectListSearchRedaction.test.ts` | **New**: search, probe, wildcard and pagination regressions | — → `a45181e1…7f58` |
| `test/server/api/bannerScopedLists.test.ts` | Projects search is no longer an SQL parameter | `971fc47f…61ad` → `d9883b19…5475` |
| `test/server/api/bannerScopedProjectDelete.test.ts` | Lock-order and deleted-while-waiting 404 tests | `e4ef251e…6702` → `b400b8ec…404a` |
| `test/server/api/bannerDissectionReadiness.test.ts` | Lock-order and 404 tests; one invariant restated (below) | `d2859d0f…6391` → `8d2b2bb4…9f72` |
| `test/server/utils/bannerScopedCanvasPostgres.test.ts` | Real-PG concurrent-delete and denied-search tests | `aa72bb46…e927` → `2a251d8e…6773` |
| `test/server/utils/dissectionJobsPostgres.test.ts` | Real-PG import+import and delete+import tests | `f4589793…a85f` → `81ca5602…b98a` |
| `docs/banner-studio/editable-artwork/INGEST-RESIDUAL-CLOSURE.md` | **New**: this report | — |

`server/utils/banner/dissectionAccess.ts` (`97fb2754…162a`) and `scopedCanvasAccess.ts` (`4603793d…05ce`) are **unchanged**. Changing them was not necessary.

## Residual 1 — redacted name recoverable through search: closed

**Root cause.** The SQL `p.name ILIKE '%search%'` ran against the stored name before redaction, without escaping. A row's presence as `Restricted artwork` therefore answered "does the hidden name contain this probe?". `%` and `_` acted as wildcards.

**Fix.** When `search` is present:
- The name predicate and `LIMIT`/`OFFSET` are dropped from SQL. The client, assignment and status scope stays.
- Every row is authorized in `updated_at DESC` order, exactly as an unsearched listing does.
- The term is matched only against the projection the caller may see, as a literal, case-insensitive substring. That projection is the real name for readable rows and `Restricted artwork` for source-denied rows.
- Offset and limit apply over those visible matches. The loop stops at the page end.

So whether a row is returned, where page boundaries fall, and how much authority work is done (which governs response timing) all depend only on what the caller can see. The tests check that a probe matching a hidden name and one matching nothing return identical rows with the same number of authority calls.

Wildcards are literal by construction because no `LIKE` is used. `limit`/`offset` must now be digit strings (≤ 9 digits); anything else is a 400 before any query, where it used to be a SQL error and a 500. Unsearched listing is unchanged: SQL pagination still keeps every slot, including restricted placeholders.

**Pagination tradeoff.** A search request now:
- reads every in-scope row for the caller (after client and status filters), without a SQL limit;
- authorizes each protected row up to the page end, with one transaction per protected row.

This is the same cost the library page already pays: it fetches the full list with no limit and filters on the client. No app caller sends `search` today. It makes the existing performance residual 3 apply to search requests. The `status` filter still matches the stored status before redaction. The prior closure classed this as target metadata, and it is unchanged.

## Residual 2 — `FOR SHARE` → `FOR UPDATE` lock upgrade: closed for delete and import

**Root cause.** `projectAccess` locks the project row `FOR SHARE`, both inside the authority checks and inside `resolveDissectionContext`. `assertScopedProjectUnchanged` later upgrades the same row to `FOR UPDATE`. Two transactions whose source-job locks do not overlap could both hold `FOR SHARE` and then each wait on the other's upgrade. Examples: a double-clicked delete of a project with no imports, two imports of different jobs into one project, or delete racing an import.

**Fix.** The upgrade is eliminated rather than the deadlock being masked. Each route takes `SELECT id FROM banner_projects WHERE id = $1 FOR UPDATE` right after its sorted source-job locks and before any authority read:
- **Delete:** immediately after the `ORDER BY job_id FOR UPDATE` job locks.
- **Import:** immediately after the sorted source union is locked and `targetId` is known.

The later `FOR SHARE` reads and the snapshot fence's `FOR UPDATE` then re-acquire a lock this transaction already holds. The second contender waits at the single row lock and then settles normally:
- 404 if the project was deleted while it waited (new; previously that path surfaced as a 403);
- 409 if the snapshot or revision changed.

Preserved behaviour:
- **Source locks:** sorted order and preflight discovery of the full union. The post-lock re-read for replay, the replay-dependency 409 fence and the snapshot fence are unchanged.
- **Authority:** fresh, re-read under locks.
- **Receipts:** exact receipt replay with no transaction retry (`transactionWithoutRetry` and receipt code untouched).
- **Static admission:** still false; not touched.

`40P01` is deliberately not mapped to 409.

**Restated invariant.** `bannerDissectionReadiness` previously asserted *no* project lock before source-authority denial. It now asserts that the only project lock before denial is the single target `FOR UPDATE`: no share lock, no snapshot fence, no write. This follows the coordinator's direction to take the project lock after the sorted source locks and before authority. It is the same class of pre-authority lock the import preflight already takes on a named project's source jobs. The test still checks that nothing is mutated.

## Proof

**Regressions established first, against the original code.**
- New list unit test: 9 of 12 failed.
- New delete and import lock-order unit tests: 6 failed.
- Real PostgreSQL: the routes were rebuilt byte-for-byte to the baseline hashes above and run through the new tests. Each test uses a barrier that holds each transaction just after its project `FOR SHARE` until both arrive (400 ms cap). All three PG tests failed with **`40P01` deadlock_detected**:
  - concurrent delete ×2 on PG 17.10;
  - import ×2 into one unprotected project, and delete racing an import, on PG 14.19.

**After the fix** (all on Node 24.18.0):

| Run | Result |
|---|---|
| `dissectionJobsPostgres.test.ts`, owned PG 14.19 | **75/75 passed** |
| `bannerScopedCanvasPostgres.test.ts`, owned PG 17.10 | **30/30 passed**, including the existing PATCH-vs-delete, lock-order, fence and replay proofs |
| The 3 deadlock tests, 3 more times each | All passed |
| Sweep: `test/server/api/banner*`, `test/server/utils/banner*`, `test/app/banner*`, `mediaProjectsApi`, `portalProjectsHistory`, `dissectionImportControls`, `mcpBannerRunner` | 75 files passed, 2 skipped (PG without env); **1273 passed, 121 skipped** |

The disposable clusters came from a scratch runner outside the repo, modelled on `/private/tmp/banner-canvas-proof.mjs`. Each was stopped (positive `pg_ctl status` exit 3) and removed. I did not run `/private/tmp/banner-owned-jobs-proof.mjs`, because it overwrites `output/editable-artwork-owned-ingestion/postgres-proof.{json,log}`. Those files were left untouched (`f9726fba…`, `4eb64189…`).

## Not done

- Typecheck, build, the full suite and the graphify rebuild were not run (root runs them after reconciliation).
- The real-PG denied-search test was only run after the fix. Its failure before the fix is inferred from the unit regression, which did fail against the original code.

## Residuals (none reopen R1–R4)

1. **Low — same upgrade pattern in sibling routes not owned here.** `projects/[id].patch.ts`, `versions/index.post.ts` and `projects/[id]/duplicate.post.ts` take `FOR SHARE` inside `withScopedCanvasAccess`, then `FOR UPDATE` in `assertScopedProjectUnchanged`.
   - They do this only for protected canvases, and contenders there usually serialize first on overlapping source-job locks.
   - Their races with delete and import are covered by the up-front lock; the existing PATCH-vs-delete PG proof passes.
   - A deadlock remains possible only between two such sibling writes whose job sets don't overlap, for example two PATCHes adding different new protected sources to a previously unprotected project.
   - Fix if wanted: the same one-line row lock after the source locks, applied in `assertScopedCanvasAccessInTransaction` when `projectId` is set and `mode !== 'read'`.
2. **Low — cross-project source owners.** When an import's source job is owned by a *different* project P2, the import takes P2 `FOR SHARE` after its target `FOR UPDATE`. Two imports that each pull in a source owned by the other's target could still deadlock. This was equally possible before, rolls back safely and needs a mutual cross-project lineage.
3. **Low (performance)** — see the pagination tradeoff above. It adds to the earlier residual 3 (per-row list transactions).
4. **Unchanged from prior closure:** residuals 4 and 5 (export-history 503 on deterministic provenance mismatch; compatibility notes).
