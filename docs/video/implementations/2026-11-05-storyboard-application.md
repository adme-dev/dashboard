# Storyboard atomic application — T06

Local implementation on `adme-dev/video-storyboard-contracts-20261104`, based on `72ca8c61fe5b869a61955c8541bb1f43d2566a25` (includes fetched `origin/main` `0a13cb061`). Independent task/spec review cleared after the authority/canonical-canvas fix pass and a scoped timeout-semantics review. No migration, push, merge, deployment, media upload or provider generation is part of this slice.

## Application and recovery

`POST /api/agency/video/projects/:id/storyboard/apply` accepts only an operation UUID, saved storyboard revision UUID, expected timeline ID/edit revision and explicit replacement confirmation. The default-off feature flag and write authority protect entry. The server resolves approved canonical references and measures media before acquiring committing locks; the request cannot supply compiled state, measurements, source locators or obligations.

The committing transaction takes the shared project lock, checks the canonical operation receipt first, then refreshes active actor/write-role authority and validates current plan/reference/timeline preconditions. Non-empty replacement requires confirmation. It fences canonical source/brand rows and relevant current authority/font rows against ordinary SQL updates and deletes. It resolves again under those fences, permitting only prepared measurements with the exact current object key/ETag/size, compares the prepared resolution identity, and compiles the timeline and obligations afresh.

The old timeline row becomes the checkpoint unchanged, preserving that row's obligation lineage and render inputs. A new editable row advances the edit revision, the project pointer moves to it, and the immutable receipt plus server-owned obligations are inserted in the same caller-owned transaction. A failure at any write rolls everything back. The receipt includes before/after timeline identities, checkpoint/version, full after-state, shot-to-clip mappings and source/obligation hashes. The transaction owner also coordinates the owner ledger; ordinary staff rely on the same canonical receipt table.

An identical operation retry returns the original committed receipt even after subsequent timeline edits or source changes. A different fingerprint with the same operation returns 409. `GET /applications/:operationId` reauthorizes project access and remains available with creation disabled; it returns the original receipt or null. Recovery does not reapply or probe media.

## Fences and limits

Current actor, selected role/group, assignments, client, canonical source and managed font records use targeted `FOR SHARE` locks. Missing seeded role policy fails closed: inserting a new system policy can replace static fallback authority without updating a lockable existing row. Newly added ordinary grants cannot revoke a decision already permitted by existing locked grants.

Legacy Banner font families choose the newest matching uploaded face, so insertion is a concrete selection phantom. Only that path uses a `banner_assets` table SHARE fence; explicit font IDs use targeted rows. This can briefly contend with unrelated asset writes. Banner exact-copy/visibility checks now consume the transaction's canonical canvas directly, avoiding cached separate-connection canvas reads.

Lock acquisition is limited to fifteen seconds; each SQL statement is limited to twenty seconds. Committing metadata checks share a ten-second budget of actual HEAD waiting (excluding intervening SQL and lock waits), after which no new HEAD is dispatched and an outstanding HEAD stops being awaited. Native R2 HEAD has no abort signal: its read may finish remotely after timeout. These controls do not claim a twenty-second transaction wall-time limit.

SQL locks cannot lock R2 objects. HEAD/measurement fingerprints prove observed identity at validation time, not an atomic external-storage snapshot or an enforced immutable-key policy. No binary is copied. Later external overwrites/deletions require revalidation by the render enforcement work in T08; this application receipt is not export approval. Font delivery likewise remains subject to subsequent storage availability.

## Verification

- Final combined storyboard/API/timeline/editor/recipe/Banner/font regression: **266/266 tests across 31 files**, including existing local FFmpeg decode fixtures.
- Four review regressions failed before the authority/canonical-canvas corrections and passed afterward. Independent scoped reviews cleared both findings and the later timeout adjustment; the last reviewer run passed **38/38** scoped tests.
- Isolated PostgreSQL: the initial corrected core run passed **7/7**. The expanded nine-case run then passed **7** and exposed **2** overly strict timeout failures: the identical-request waiter exceeded the original five-second lock wait, and a source-contention case exhausted the original absolute metadata deadline while doing SQL. After separating actual HEAD waiting from SQL time and adjusting bounded SQL waits, the targeted rerun passed **2/2**, with the other seven intentionally skipped. Thus all nine cases have passing evidence across runs; there was no single all-nine final green run.
- The real source-contention case verifies a concurrent source UPDATE gets PostgreSQL `55P03` while application holds its row lock, application commits, and the same source UPDATE succeeds afterward. Other real cases cover autosave races, rollback at checkpoint/receipt/obligation writes, prior obligation retention, reference revocation and actor deactivation.
- Scoped lint and diff whitespace checks pass. Standalone strict TypeScript reports the same **66 existing** dependency/auto-import diagnostics and none in T06 modules/tests. No full application build is claimed.

Evidence: `.verification/video-t06/regression-final.log`, `review-red.log`, `review-green.log`, `database-third.log`, `database-final.log`, `database-timeout-fixes.log`, `lint-final.log`, `types-final.log`.

The isolated target is Neon branch `br-muddy-wind-a4u7axf9`, endpoint `ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech`, database `neondb`. The runner verifies the configured source provenance then rewrites only to that allowlisted endpoint. Tests create and remove uniquely identified synthetic projects/assets/actor/role; they stub storage HEAD and media measurement, never upload media or send a customer/provider event. No configured database schema change is needed: migration 501 already supplies application/obligation tables.

## Remaining gates

T07 owns UI adoption, confirmation presentation, undo/redo and receipt-recovery journeys. T08 owns direct-save/render obligation enforcement, adjusted-edit review and rendered output verification, including restored/flag-off edits. T09 owns public release claims. Existing marketing pages remain unchanged because this default-off backend slice does not release a usable feature. No full Nuxt build, browser, hosted probe, rendered output or production acceptance is claimed.
