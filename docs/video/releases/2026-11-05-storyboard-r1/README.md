# Storyboard R1 release evidence

Status: T09 in progress; R1 acceptance and rollout remain open. No application or worker deployment, paid generation or production activation was performed in this checkpoint.

## Source and environment

- Reconciled candidate: `f4fa5076c6c7c1938fc90144ba174c29c22de8cf`.
- Fetched main: `401350e0404e94eb93aee78ca42333714c6e9a5d`.
- Twelve local commits rebased without conflicts over eight new main commits. Original T08 is retained by `archive/video-t08-bcfe0ce50`; its rebased equivalent is the candidate above.
- Intended Pages project: `agency-dashboard`. Deployment ID and hosted flag/binding receipts: pending.
- Node 24.18.0 is installed and passes `pnpm deploy:check` for this candidate. Initial shell Node 24.22.1 failed the exact-version guard; the guard was preserved.
- Docker `info` stalled and the owned probe was stopped. Linux image execution remains pending. Local disk available at preflight: approximately 5.2 GiB; no image download or unrelated cleanup was attempted.

## Verification

Supporting T01–T08 evidence is linked from the [implementation plan](../../../superpowers/plans/2026-11-04-video-storyboard-producer.md) and [T08 receipt](../../implementations/2026-11-05-storyboard-render-enforcement.md). It does not substitute for integrated acceptance.

Local checkpoint artifacts are under `.verification/video-t09/` (ignored, retained in the worktree):

- `deploy-check.log`: initial exact-Node guard rejection.
- `deploy-check-node24.log`: guarded target/source check passed with Node 24.18.0.
- `reconciled-tests.log`: broader initial run, 1007 passed / 4 failed. Two deploy-guard cases used the wrong Node; two legacy render fixtures omitted the new lineage lookup response. Their mocks now explicitly return no obligations and assert the source revision lookup.
- `reconciled-tests-final.log`: 1,011/1,011 tests passed across 159 files under Node 24.18.0, including all audio tests and incoming banner preview regressions.
- `build.log`: client bundling passed (21.17 seconds) and server bundling passed (28.37 seconds). Nitro packaging was terminated by the operator when free disk fell to 138 MiB; command exited 143. Full build, worker wrapping and size checks remain unverified. No build-failure baseline attribution is claimed.
- `legacy-render-final.log`: 11/11 legacy render tests passed after test typing/import lint cleanup; `lint-final.log` is clean.
- Runbook and release-index relative links resolve; `git diff --check` passed.
- `kimi-checkpoint-review.log`: bounded review of supplied checkpoint text/test diff found no important issues. This review accepted supplied source facts; it is not an independent whole-branch or runtime review. The initial tool-based review exited without a verdict and is not counted as approval.

No full repository CI, authenticated browser, physical-device or hosted render pass is claimed.

## R1 acceptance matrix

| Criterion | Required hosted evidence | Status |
| --- | --- | --- |
| A1 | Six-shot 30-second dealer offer, exact frame total, editable saved timeline | Pending |
| A2 | Product reveal and brand story; same asset reused across distinct shots | Pending |
| A3 | Byte-exact approved copy, missing price rejected, explicit revision approval | Pending |
| A4 | Wrong-client, revoked, stale, missing and unknown approvals rejected server-side | Pending |
| A5 | Atomic visual/audio/caption/overlay application; unresolved required input writes nothing | Pending |
| A6 | Two-tab CAS, replay/timeout recovery, undo/redo/refresh, adjusted-edit review preserves work | Pending |
| A7 | Three formats visually and audibly reviewed; deletion/muting/metadata stripping/restore/flag-off cannot bypass copy | Pending |
| A8 | Signed-in keyboard/narrow/dark journey plus legacy audio/AV/manual editor and navigation | Pending |
| A13 | Controls reach plan; example prefill has no AI/save/generation side effects; stale/inaccessible evidence rejected | Pending |
| Pilot | Baseline, completion rate and time targets measured with actual internal users | Pending |
| Rollback | Verified compatible artifact and deployment ID; flag-off enforcement verified | Pending |

## Hosted prerequisites

The checked-in worker points at shared resources, while the Pages probe binding is production-only. The worker callback accepts only two production origins. Consequently this configuration cannot serve as isolated preview acceptance. The [operator runbook](../../../runbooks/video-storyboard-producer.md) defines the required database/storage/queue/service isolation and exact callback-origin policy work before preview deployment. Recover adequate local disk capacity and a responsive Docker runtime before attempting another build or Linux fixture run. Linux execution, hosted identities, fixture permissions, secret presence, deployment records and a compatible rollback artifact remain required. Other active work was neither stopped nor cleaned up.

## Retry with a 10 GiB heap limit

At the user's request, the build script now sets `--max-old-space-size=10240` (previously 16384). This limits Node old space, not total process memory. Under Node 24.18.0, Nuxt/Nitro compilation and worker wrapping completed; the final `check-worker-size.mjs` gate failed. The command exited 1, so a passing full production build is still not claimed.

The resulting worker is 25,596,901 raw bytes against the immutable 25,468,928-byte safety budget: 127,973 bytes over. Gzip size is 7,389,820 against 9,750,000 bytes. The budget was not changed. Evidence: `.verification/video-t09/build-10gb.log`. Free disk remained around 10 GiB during this retry. Resolve the bundle-size failure before deployment; Linux and hosted acceptance remain separate outstanding gates.

## Media editor worker size reduction

The candidate was reconciled again with main `9c7393357de7b9387b4756e881baa9e01a4d047b` before this change (application base `48ea6e390abac54f2c0f0295e2da51371398ce71`). The large browser editor now lives in `app/components/media/ProjectEditor.client.vue`. Its original route retains `layout: 'agency'`, `role-creative` middleware and the same URL, and renders the auto-imported `MediaProjectEditor`. Editor logic and markup are unchanged from the prior page; only page metadata and whitespace on one empty line were removed. Agency routes already disable SSR; this boundary removes unused server-rendering code without removing the browser editor. No size budget or compaction algorithm was changed.

Evidence under `.verification/video-t09/size/`:

- `tests.log`: 1,027/1,027 tests across 161 files, including audio/video, editor persistence, storyboard, incoming banner-library changes and deployment/size guards.
- `boundary.json`: generated SSR route is 1,393 bytes and uses `ServerPlaceholder`; client editor code remains present in its generated bundle. Auto-import registration resolves to the client-only component.
- `lint-baseline.json`: the moved editor retains the original diagnostics (283 before cleanup, 282 after removing trailing whitespace on one empty line) after accounting for the removed metadata lines; the route wrapper has zero errors/warnings. This is no new lint regression, not a clean-editor lint claim.
- `kimi-review.log`: focused read-only review of route params, component lifecycle, descendant leave guards, auto-imports and authorization found no important issues.
- `build-client-editor.log`: full Node 24.18.0 / 10 GiB build passed (exit 0), including Nuxt/Nitro, worker wrapping and the unchanged size guard. Raw size is 25,270,902 / 25,468,928 bytes (198,026 bytes remaining); gzip is 7,312,779 / 9,750,000 bytes (2,437,221 remaining). This supersedes the size failure from the preceding retry. The complete worker is 325,999 raw bytes smaller than that failed artifact; the latest main changes are included too.

This change does not complete authenticated editor acceptance, Linux container execution or isolated hosted rollout.
