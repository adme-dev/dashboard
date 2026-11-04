# FigFlow workspace final-main integration — 4 November 2026

PR #832 remains a draft release candidate, not a shipped or hosted-accepted feature.

## Reconciled source

Freshly fetched `origin/main` was `d470408c1cafb58c20d93a197ca350f5de7b3eee`, the normal PR #829 merge with parents `506acc7110c5ed24ad4bc96f8c06e4d4031bf65d` and `e60eb46f03cce2f8366edf9fc70d9e3933d39ff4`. Merged this final dependency head once into the workspace branch as `89956cf68ee61fbf0ca373609213e9394d364c89`, without conflicts, preserving the local task-list commit `0e2860a3b`.

Confirmed native PR #830 and banner `87ceb82cf` ancestry. The shared exact-blank helper reconciled to one copy: `shared/emailRendering/designComposer.ts` is identical to main. Backend routes/authority, Worker configuration, native patches/pins and the application editor pointer are also identical to main. Application changes remain byte-identical to independently approved `711b870370a340eb4735dcdacc410bdb8a56d49d`; only test-isolation annotations and dated release documentation followed that approval.

Template-designer/global-designer/library/brand flags remain false. The existing draft-saves gate remains unchanged. Native source is merged, but asset/gateway publication and the editor pointer update are separate work; no such action occurred here.

## Combined verification

Executed one focused Vitest process using repository configuration, an owned cache and one worker, with `FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered`:

- **25 suites / 440 tests passed; 0 failed, 0 skipped, 0 todo.**
- Real PostgreSQL: **100/100** (61 revision, 18 designer/blank, 21 campaign cases). Includes actual transaction refusal rollback, blank/shared-null committed lost-reply replay, unchanged schema-0 start and changed-owner refusal, JSONB blank discovery, Apply/readback/exact-head reopen and registered-image insertion.
- Remaining **340** mounted/unit/config cases include the 54 workspace regressions, template-only gate/access, content/designer/campaign denial, blank exactness and lookup, initialization/module persistence, deployment guards, metadata/native exclusion, real-Reka modal recovery, exact pending replay and CAS behavior.
- **8/8** changed Vue SFC scripts/templates compiled; `git diff --check` passed.

The PostgreSQL fixture was verified before use: database `figflow_design_test`, user `figflow_test`, release-tree `.verification/figflow-postgres-20261102/data`, and empty `listen_addresses`. Tests create/drop their own unique schemas; no production database or live application mutation occurred. The fixture service was not restarted or reconfigured. No dependency install or heavy local Nuxt/native build ran.

Raw evidence and exact command are under `.verification/workspace-final-integration-20261104/`: `combined-tests.log`, `combined-tests.json`, and `command.txt`. Disabled external iframe warnings remain test-environment output, not hosted rendering evidence.

## CI and release order

Push the reconciled candidate once, then use existing PR broad CI and the existing FigFlow email-design workflow on that exact branch head for Worker/admission/PostgreSQL/typecheck validation. CI links and exact pushed head are recorded in the local release receipt and PR body; local results do not substitute for those runs.

Normal PR #832 merge is held until the coordinator confirms PR #833's merge and guarded native asset/gateway publication checkpoint. Re-fetch current main at that handoff; preserve the separately owned `shared/emailRendering/designRoundtrip.ts` pointer change without editing it here. Do not enable publishing, global authoring/library/brand flags or migration499 in this workspace.

Remaining acceptance: exact final-main CI/build, authorized template-only activation in release order, authenticated hosted blank/starter/existing/imported draft Save/reload, real application CAS/uncertainty handling, visible native plus compiled desktop/mobile output, established navigation including QR Codes and applicable mail-client fidelity. No merge, deployment, asset publication, pointer or flag change was performed by this integration task.
