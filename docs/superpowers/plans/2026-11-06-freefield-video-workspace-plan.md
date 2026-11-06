# Freefield Video Workspace Implementation Plan

**Goal:** Enable implemented storyboard authoring within Pages capacity, then deliver the screenshot-directed canonical project/workspace UI.
**Architecture:** Nuxt4/NuxtUIv4 presentation over existing projects/assets/storyboard/provider/job contracts; no separate GPU platform or fake availability.
**Spec:**2026-11-06-freefield-video-workspace-design.md (user screenshots and coordinator go-fast approval supersede prior review pause).

## Constraints and review focus
Node24.18.0;10GiB heap; immutable agency-dashboard source/target/budget guards; current-main CI before normal merge; no overlapping builds/installs or edits. Preserve tenancy, project CAS, approval, quote/budget and provider admission. Test cross-project cover leakage, expired cover fallback, ambiguous create retry, disabled provider selection and history/read side effects. Read frontend-design before forms; use semantic dark/light NuxtUI and bounded scrolling.

## Tasks
- [x] A. Shared storyboard default-on policy and explicitfalse override: shared/video/storyboardFeaturePolicy.ts, server/utils/video-storyboard/policy.ts, nuxt.config.ts;33tests and independent review.
- [ ] B. Exact-head CI, fresh-main reconciliation, normal merge and guarded Pages activation; verify publicflag and server gate; no paid calls.
- [x] C. Kimi K3.1 Pro gallery/create/header in isolated ui-source; owns projects/index.vue and new VideoStudioProjectGallery/WorkspaceHeader only. Real optional cover projection; valid navigation; stable create retry key; no backend edits.
- [x] D. Codex authorized cover projection in projects/index.get.ts + projectCovers.ts + focused tests; bounded existing media lookup and safe null fallback; no extraction/generation.
- [x] E. Integrator workspace layout/model-feature menu/history/how-it-works over existing ProjectEditor/Workbench services; no dead controls, provider eligibility remains truthful. Existing assets/storyboard/timeline preserved.
- [ ] F. Integrate C/D/E after activation main; targeted component/API/regression/type-delta tests, screenshot review at desktop/narrow widths, independent source review. Update marketing/handoff accurately.
- [ ] G. Fresh exact-main CI and guarded release; readback/live routes/flags; preserve source/evidence and remove only owned disposable build artifacts after backup. Held externalColima remains untouched pending ownership.

## Ownership
Activation source repo:/Volumes/Backups/xf-video-activation-20261106/source. UI repo:/Volumes/Backups/xf-video-activation-20261106/ui-source. Kimi uses supported alias kimi-code/k3.1-pro; no provider/model claim beyond actual CLI receipt. Code reviewers cannot install/build or edit implementation files. Coordinator oversees active Banner publisher; no duplicate audio-jobs release.

Integration evidence before release: 516 tests across 91 files passed, changed-file ESLint clean, independent review findings repaired and regression-tested. Exact-main type comparison, live visual review and guarded release remain pending; implementation completion does not imply production acceptance.
