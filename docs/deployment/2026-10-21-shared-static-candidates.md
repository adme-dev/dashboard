# Shared static data candidate selection

## Problem

The Becky creative connector exposed a Pages build-size blocker: banner PR683's CI artifact exceeded the unchanged 25,468,928-byte raw release budget by 477 bytes. A local Node 24.18.0 build of the same branch also failed, by 44 bytes. Environment-dependent output means these are separate measurements, not interchangeable receipts.

Directory compaction discarded a module whenever its own inline decoder cost more than its encoded SQL saved. That excluded modules which would save space using the already supported shared decoder. Choosing the shared form later could not recover candidates that had already been discarded.

## Change and preservation

Keep both inline and shared candidates until the complete directory comparison, including a newly created helper's bytes. Write only changed selected candidates and report actual net savings. Existing SSR and split SQL directories use the same selection logic. A singleton stays untouched if the total Worker would grow.

Literal eligibility, compression, decoded values, request parameters, lazy caches, platform compatibility, minimum literal lengths and raw/gzip release limits are unchanged. No runtime feature, tenant check, route, provider, dependency or configuration is removed or widened. This is a build correction, not activation of the creative connector. Existing public features require no marketing change.

## Verification

- New regression file: one no-growth case passed and three shared-candidate cases failed before the implementation change.
- Six related compaction/size/runtime suites: 73 tests passed after the fix, including actual workerd execution after minification and filename compaction.
- Modified script and new test file pass ESLint; git diff whitespace checks pass.
- Independent review: no blockers, 29 tests passed separately. Additional 30-scenario/144-module checks verified exact byte accounting, no total growth, SQL and parameter preservation, Unicode/escape handling and second-pass stability.
- Full production build and CI are recorded separately below; local fixtures do not establish deployment acceptance.

## Source boundaries

Base: current fetched main e37b94b87d76c043fbfbf2c90f10a5b77c4dab04. Implementation is limited to scripts/compact-worker-static-data.mjs; regression coverage is additive. The canonical dirty checkout and both banner/video connector branches are preserved. Integrate this correction before revalidating those branches against current main.

## Local production build receipt

Node24.18.0 `pnpm build` completed successfully on21October2026. Raw output25,456,115 /25,468,928bytes (12,813remaining); gzip7,189,409 /9,750,000bytes (2,560,591remaining). The candidate emitted721 compacted route SQL strings in397modules. This build is the isolated build-fix branch on current main, not the banner/video branches and not a deployable release receipt. Their integrated output must pass its own checks. The full log is retained locally as `/private/tmp/becky-shared-static-build.log`.
