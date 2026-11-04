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
