# Storyboard input contracts — first implementation slice

Date: 4 November 2026

Status: local foundation implementation; R1/R2/R3 acceptance remains pending.

## Scope and source

The user requested starting some implementation from the [delivery plan](../../superpowers/plans/2026-11-04-video-storyboard-producer.md). This slice implements T01's plan/copy/recipe input contracts and connects the existing producer picker to the shared catalogue. It does not add a storyboard UI, persistence, generation, migrations or deployment.

Branch: `adme-dev/video-storyboard-contracts-20261104`, created from freshly fetched `origin/main` at `87ceb82cfc23a76959e0d0d3d989c96d8ce36d23`. The prior research/plan commits were cherry-picked onto that base; unrelated banner changes on current main are retained.

## Implemented

- `shared/video/storyboard.ts`: strict Zod shapes and inferred types for plan, shots, copy revisions, source bindings and timed cues. Plans permit 1–24 shots and at most 120 seconds, use integer frame timing, and reject unknown fields instead of dropping them silently.
- `shared/video/storyboardValidation.ts`: exact duration totals, stable unique shot/cue IDs, ordered complete script coverage, required-copy assignment, valid cue references/ranges, required-versus-omitted audio and compatible asset kinds. Findings never echo supplied text or arbitrary keys.
- `validateApprovedCopy`: compares exact text, IDs, revision, hash, required flags and recorded approval against a caller-supplied canonical server revision, without trimming Unicode/whitespace. The caller must load and authorize that canonical revision; a matching client claim is not authority.
- `shared/video/storyboardRecipes.ts`: one revisioned catalogue for the existing five recipes, typed editorial settings/defaults, strict override validation and isolated snapshots. Single camera movement is prompt guidance. These controls are not yet connected to AI planning or provider submission.
- `app/utils/video/producerRecipes.ts`: compatibility adapter retaining the existing picker IDs, labels, descriptions, brief text, format and asset preferences.

Structural validity is deliberately distinct from media readiness. An unresolved source is a valid draft binding; short/unmeasured/unauthorized media still needs server resolution. Submitted approval fields, timing labels and hashes are data to verify, never permission to render. This slice adds no server endpoints that trust these fields.

Copy revision IDs and storyboard/shot identities use UUIDs. Local segment/cue IDs use bounded identifier strings. Frame ranges are paired in/out bounds in source frames; future resolution must use measured source frame rate. Recipe snapshots retain their chosen revision and values; creation resolves a known catalogue revision, while parsing historical snapshots does not replace them with current defaults.

## Verification

- Initial TDD run: 40 failed / 2 passed against explicit unimplemented scaffolds; no missing-module/harness failures. A later lane-compatibility regression produced two failures before the fix.
- Final focused/regression run: **97 tests passed across 8 files**: new storyboard schema/copy/recipe suites plus existing producer recipes, producer rail, AI assembly, timeline application and timeline schema.
- Strict TypeScript check covers all new modules/tests and the existing recipe adapter. Scoped ESLint and whitespace checks cover the changed files.
- Existing Vite warning: config uses `__dirname`, unsupported by a future native config-loader default. It did not fail tests.
- Full application build, full repository suite, hosted browser journeys, DB, provider output and release acceptance have not been run or claimed for this contract-only slice.

Reproduce the focused tests:

```sh
pnpm exec vitest run test/video/storyboardSchema.test.ts test/video/storyboardCopy.test.ts test/video/storyboardRecipes.test.ts test/app/videoProducerRecipes.test.ts test/components/videoStudioProducerRail.test.ts test/video/aiAssembly.test.ts test/video/aiAssemblyTimeline.test.ts test/audio/timelineSchema.test.ts
```

## Decisions and remaining work

- Limit the first implementation to input contracts and the compatibility adapter: the request was to start some work. T02–T14 remain pending; no release is accepted by this slice.
- Define `ResolvedStoryboard`/compiler types with T05, application receipts/obligations with T06, and adjusted-edit review types with T08. Those contracts depend on canonical persistence/media integration; inventing unconsumed authority-bearing types here would conceal unresolved integration work.
- Keep public marketing unchanged until the new capability is usable and accepted. No new storyboard UI or production capability is advertised from this foundation.
- T02 is next: revision-checked timeline persistence. T03 adds stored/authorized storyboard revisions; T04 binds recipe settings to planning; T07 supplies the visible storyboard/example workflow. A13 remains pending until those integration checks pass.
