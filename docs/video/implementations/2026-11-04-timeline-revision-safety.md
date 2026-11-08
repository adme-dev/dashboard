# T02 — Timeline revision safety

Status: implemented and independently reviewed locally on 4 November 2026. Migration 500 is applied to the configured agency database. Application code is not deployed; browser recovery and hosted rendering acceptance remain open.

Plan: [T02](../../superpowers/plans/2026-11-04-video-storyboard-producer.md#t02--protect-timeline-persistence-against-concurrent-writes). Branch: `adme-dev/video-storyboard-contracts-20261104`. Before implementation, the local-only T01/planning commits were rebased onto freshly fetched `origin/main` `d470408c1cafb58c20d93a197ca350f5de7b3eee`. T02's parent is `3a467cf49f575ed51ca6d921143de4ae28fa5e12`.

## Behavior

Timeline reads expose `editRevision`. Saves, named versions and both render endpoints require the timeline ID and edit revision that the caller read. Missing, invalid or superseded preconditions return HTTP 409. Each mutation locks the project row, checks owner/admin/creator access, and checks the current pointer and revision under that lock. There is no unguarded legacy save entry point.

Saves increment the edit revision independently of the visible version number. Creating a named version preserves the source schema version and moves the active pointer to a new row. Render snapshots use separate rows and leave the draft pointer in place. For older projects whose active row is already a render input, the next save creates a successor instead of changing that input. Snapshot version allocation shares the project lock.

Owner-mode save/version replays check the receipt's exact row and revision under the same lock. A later edit cannot be returned as if it were the original save receipt. Render replay remains conservative: a completed render request replayed after a later edit returns 409; its existing job is available in the job list.

The editor serializes saves, versions, renders and explicit reloads. It reads the current token when each operation starts and flushes pending edits before snapshotting. Edits made while a save is in flight remain dirty. Conflicts stop further saves and retain the local timeline. An uncertain version response also stops saving until reload. Recovery offers a local JSON download and a confirmation before replacing local edits and undo history. The download contains timeline data only; media files and an editor import workflow are not included. A new edit made during reload prevents replacement.

The existing Video Studio and Media Studio marketing entries describe these protections in the same application candidate. Existing navigation categories already cover them; no new navigation entry or feature count was needed. Publishing that copy remains paired with application release.

## Validation

- Final targeted regression run: **135 tests passed across 12 files**. Coverage includes guarded writes, missing tokens, ownership denial, stale versions/renders, owner replay receipts, queue ordering, in-flight edits, ambiguous version responses and explicit reload recovery.
- Isolated Neon database run: **5 tests passed**. One is an actual simultaneous two-writer race: exactly one revision-zero save commits revision one. Four sequential SQL checks cover changed pointers, immutable render snapshots, legacy snapshot copy-on-write and ownership denial. All use the real persistence functions and transaction SQL; no render queue/provider is invoked.
- Initial database run hit the default five-second timeout in three cases. The opt-in remote suite uses a 30-second test limit; the successful run took 27.06 seconds in total. This is functional evidence, not a latency benchmark.
- Fresh independent reviewer: no Critical or Important findings; independently reran **124 tests across 10 files** and `git diff --check`. They inspected the recorded 135-test and isolated-database results without accessing a database.
- New modules/tests pass scoped ESLint. Comparing modified files with their parent revision reports **zero introduced or changed-line lint diagnostics**; existing file-wide lint debt remains.
- Strict TypeScript passes for the new precondition/queue modules and queue tests. The broader focused check of persistence/editor modules and tests has no diagnostics in changed files, but is not green: unchanged `server/utils/db.ts` has three `Pool.connect` overload/return-type diagnostics at lines 375, 380 and 382. A further ad-hoc route check also encountered unresolved Nuxt auto-imports and unrelated dependency diagnostics; it is not a full Nuxt typecheck result.
- The editor page and both changed marketing pages pass Vue script/template compilation. No full application build, full repository suite, browser download/reload interaction, hosted rendering or deployment is claimed.

Reproduce the targeted regression run:

```sh
pnpm exec vitest run test/audio/mediaProjects.test.ts test/audio/mediaProjectsApi.test.ts test/audio/mediaRenderJobs.test.ts test/audio/mediaRenderApi.test.ts test/audio/renderVideoApi.test.ts test/audio/timelineRevision.test.ts test/audio/timelineSchema.test.ts test/app/mediaEditorPersistence.test.ts test/app/mediaEditorSaveConcurrency.test.ts test/audio/mediaEditorAv.test.ts test/composables/editorAutosave.test.ts test/server/utils/mediaProjectGodModeMutations.test.ts
```

The opt-in database test is `test/integration/mediaTimelineRevision.database.test.ts`. Set `MEDIA_TIMELINE_TEST_DATABASE_URL` to an isolated branch connection and `MEDIA_TIMELINE_TEST_DATABASE_HOST` to the matching host. Without the connection variable, it skips. The configured production endpoint is explicitly rejected. Never supply a production database for fixtures.

## Migration receipt

Migration: [`500_media_timeline_edit_revision.sql`](../../../server/database/migrations/500_media_timeline_edit_revision.sql).

SHA-256: `3a7d5e9a526c7fcbd9a2a2e459c1db8013eb338de1822b3c5b5810edd61d8ae5`.

Target provenance: this worktree has no `.env`. The repository's main checkout environment was loaded from `/Users/paulgiurin/Documents/Projects/dashboard/.env`. Its database host/database were matched against Neon project and endpoint metadata before any write. Credentials were passed only through the process environment, never logged or committed.

| Target | Verified identity | Result |
| --- | --- | --- |
| Isolated test branch | Neon project `square-tooth-23821574` (`agency`), branch `br-muddy-wind-a4u7axf9`, name `video-t02-revision-test-20261104`, database `neondb` | Migration and idempotent repeat committed; five database checks passed |
| Configured agency database | Same project, production branch `br-small-hall-a4qtwjgo`, host `ep-lively-fog-a4dum154-pooler.us-east-1.aws.neon.tech`, database `neondb` | Migration committed; schema readback passed |

The additive migration ran through `psql --no-psqlrc -v ON_ERROR_STOP=1 -f ...` with a five-second transaction-local lock timeout. Configured-target output was `BEGIN`, `SET`, `ALTER TABLE`, `COMMIT`, exit 0. A subsequent single-query catalogue check returned `integer|NO|0|CHECK ((edit_revision >= 0))`, confirming type, nullability, default and constraint.

The initial readback helper expected both result sets from a multi-statement query but received only the final constraint result. A single catalogue query corrected that verification harness; no migration change or repeat production write was needed.

The schema preserves existing application inserts. It does **not** make the older deployed writers revision-safe: the new application handlers must be released before these protections are live. No existing timeline state or project pointer was migrated. Synthetic project fixtures were confined to the isolated branch and cleaned up by the tests. The isolated branch remains available for follow-up validation; it has not been deleted.

## Remaining work

T03 is next: persist storyboard revisions and approved references. T02 does not add storyboard planning, generation, compilation or a new render provider. R1 acceptance, merge, application deployment and browser/runtime verification remain separate.

Nonblocking review follow-up: consider returning an existing immutable render receipt after later edits, while retaining authorization and duplicate-dispatch protection. Current behavior rejects that replay and uses the job list for recovery.
