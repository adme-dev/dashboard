# Video Studio Storyboard Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a planning deliverable; it does not start implementation or select an execution method.

**Goal:** Add a reviewable storyboard-to-timeline workflow, then staged shot generation and continuity, inside the existing Video Studio.

**Architecture:** Store versioned storyboard/reference/application records in Neon and resolve canonical media from existing sources. Compile approved plans into the existing AV timeline and renderer, with atomic application, revision checks and recoverable checkpoints. Later production coordination uses Cloudflare Workflows around existing generation jobs and budget controls.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro, Zod, Neon/Postgres, R2, existing Groq/model routing, Cloudflare AI Gateway, Workers/Queues/Workflows and the existing FFmpeg container.

**Spec:** [Video Studio Storyboard Producer PRD](../specs/2026-11-04-video-storyboard-producer-prd.md)

**Research:** [Freefield review and FF-RD01–FF-RD05 backlog](../../research/2026-11-04-freefield-video-rd.md). This adds recipe/example and run-quality refinements to the existing fourteen tasks; GPU/backend/tool experiments remain separate.

**Status:** T01 input contracts and the existing recipe adapter are implemented locally; T02–T14 and all release acceptance remain pending. [Implementation receipt](../../video/implementations/2026-11-04-storyboard-contracts.md). Planning baseline `c39b8b7f4a79f73350e2a1c4620075f87881a6c5`; first implementation base `87ceb82cfc23a76959e0d0d3d989c96d8ce36d23`. Refresh before further execution. This plan does not reopen historical completed tasks except for the explicit integration changes below.

## Global constraints

- R1 uses existing media; its storyboard workflow does not automatically invoke paid image/video/voice/music generation. Text planning uses existing model routing.
- R1 supports 1–24 shots, up to 120 seconds, integer frames at the project frame rate, and `reels_9x16`, `square_1x1`, `youtube_16x9`.
- Use canonical media IDs, project/client authorization and pinned revisions/hashes; never accept client-provided R2 keys as authority.
- Vehicle text-to-video remains blocked. Unknown rights/approval remain unknown. Type-derived UI badges cannot establish approval.
- Approved script and required on-screen copy are immutable to AI. Copy changes create new revisions.
- Use Nuxt UI v4 and the project-required frontend-design skill for forms, bounded scrolling and container-responsive field grids.
- Apply replaces the full cut only after a replacement preview/confirmation when non-empty; it is atomic, revision-checked, idempotent and one undo step.
- Keep manual editing, old AV/audio projects, current generation providers and existing rendering/distribution journeys working.
- New flags default off; later flags depend on earlier flags and existing policies. Disabling new actions preserves saved data and recovery.
- Follow AGENTS.md for source freshness, migration execution, pre-commit review, marketing sync and guarded deployment. This plan does not create SQL or run migrations.
- Before any implementation commit, reread every changed file and perform the repository's deep review. Focused tests precede broader checks; a commit is not release acceptance.

## Review focus

1. **Two tabs / slow autosave / lost response:** no overwrite, duplicate apply or phantom saved state — T02, T06, T07.
2. **Asset or brand change after approval:** immutable provenance plus current eligibility, with no stale render — T03, T08.
3. **Approved copy in unusual scripts or long disclaimers:** exact characters/order preserved, overflow surfaced, no false alignment; deleted/hidden cues and stripped metadata cannot erase server obligations — T01, T04, T05, T08.
4. **Media shorter than the proposed shot / repeated source usage:** valid repeats; no silent stretching, looping or speech truncation — T05, T07.
5. **Recipe/control drift, wrong output or misleading success:** versioned definitions, explicit artifact roles, semantic evaluation and safe examples — T04, T07, T09–T12.
6. **Provider accepted a request but response/callback was lost:** retained liability and reconciliation, never blind resubmission — T10, T11, T12.

## Delivery and dependencies

| Task | Deliverable | Release | Depends on | Relative size |
|---|---|---|---|---|
| T01 | Shared plan/copy contracts | R1 | — | M |
| T02 | Timeline revision and save protection | R1 | — | L |
| T03 | Storyboard storage, references and access | R1 | T01 | L |
| T04 | AI/manual planning and revision | R1 | T01, T03 | M |
| T05 | Deterministic media/lane compilation | R1 | T01, T03 | L |
| T06 | Atomic apply, checkpoint and receipts | R1 | T02, T03, T05 | L |
| T07 | Storyboard workbench and editor adoption | R1 | T04, T06 | L |
| T08 | Exact-copy render/dependency checks and adjusted-edit review | R1 | T03, T05, T06, T07 | L |
| T09 | R1 hosted acceptance and rollout | R1 | T01–T08 | M |
| T10 | Production attempts, approvals and accounting | R2 | R1 accepted | L |
| T11 | Durable coordinator and capability routing | R2 | T10 | L |
| T12 | Take review UI and R2 acceptance | R2 | T11 | L |
| T13 | Final-frame continuity and invalidation | R3 | R2 accepted | L |
| T14 | Directed audio, targeted revisions and R3 acceptance | R3 | T13 | L |

Sizes express relative complexity, not calendar promises. T02 affects shared editor persistence and needs its own review. Land small coherent PRs; do not combine all releases into one PR. T01/T03 schema groundwork can remain dormant, but only T09 earns an R1 product-complete claim.

## File and interface map

New paths below are proposed; existing paths were inspected or inventoried at the baseline. Allocate the next available numbered SQL migrations only after fetching main at the start of each schema task; record the exact chosen filenames in that task's implementation receipt. Do not pre-reserve a stale migration number in this document.

| Area | New files | Existing integration points |
|---|---|---|
| Contracts | `shared/video/storyboard.ts`, `shared/video/storyboardValidation.ts`, `shared/video/storyboardRecipes.ts` | `server/utils/audio/timelineSchema.ts`, `app/types/index.ts` |
| Persistence/access | `server/utils/video-storyboard/store.ts`, `access.ts`, `references.ts`, `policy.ts` | `server/utils/db.ts`, `server/utils/video-asset-intelligence/access.ts`, canonical asset stores |
| Planning | `server/utils/video-storyboard/planning.ts`, `copy.ts` | `server/utils/ai/resolvedGroq.ts`, `app/utils/video/producerRecipes.ts` |
| Assembly | `server/utils/video-storyboard/resolve.ts`, `apply.ts`, `renderValidation.ts`, `timelineReview.ts`, `shared/video/storyboardCompile.ts` | `server/utils/audio/projects.ts`, timeline/versions/render endpoints |
| Client | `app/composables/useVideoStoryboard.ts`, `app/components/media/VideoStudioStoryboard.vue`, `VideoStudioShotInspector.vue`, `VideoStudioReferenceSet.vue` | `VideoStudioWorkbench.vue`, `VideoStudioProducerRail.vue`, `useMediaProjectEditor.ts`, audio project `[id].vue` |
| R2 production | `server/utils/video-storyboard/production.ts`, `productionBudget.ts`, `productionPolicy.ts`, `app/components/media/VideoStudioShotProduction.vue` | `server/utils/video-generation/`, `workers/video-generation/`, `workers/agency-workflows/` |
| R3 | `server/utils/video-storyboard/continuity.ts`, `audioDirection.ts`, `workers/audio-jobs/container/continuityFrame.mjs` | existing source registry, audio generation and container render entry points |

T01 defines input contracts `StoryboardPlan`, `StoryboardShot`, `AssetBinding`, `CopyRevision`, `ReadinessFinding` and versioned recipe values/snapshots. Define `ResolvedStoryboard` and `StoryboardCompileResult` with T05, `StoryboardApplicationReceipt` and `StoryboardTimelineObligations` with T06, and `StoryboardTimelineReview` with T08 against their canonical integration boundaries. `ReadinessFinding` has `code`, `severity: 'blocker' | 'warning'`, optional `shotId`, and a content-safe message. `StoryboardCompileResult` is `{ ok: true; state: TimelineState; shotClipMap: Record<string, string[]>; obligations: StoryboardTimelineObligations } | { ok: false; findings: ReadinessFinding[] }`. Obligations contain application lineage, required cue/source IDs, clip mappings and expected exact content/visibility/timing/layout. A review pins actor/time, timeline ID/revision, obligation hash and validated render-manifest identity.

## R1 — Storyboard and existing-media assembly

### T01 — Define the plan, copy and timing contract

**Files:** create shared contracts/validation above and `test/video/storyboardSchema.test.ts`, `test/video/storyboardCopy.test.ts`, `test/video/storyboardRecipes.test.ts`; expose frontend types through `app/types/index.ts` only where needed.

**Interfaces:** `validateStoryboardPlan(plan: unknown): { ok: true; plan: StoryboardPlan } | { ok: false; findings: ReadinessFinding[] }`; `validateApprovedCopy(plan: StoryboardPlan, copy: CopyRevision): ReadinessFinding[]`. Refer to PRD §7 for fields; immutable revisions use UUID identities and a separate numeric sequence where useful in the UI.

- [x] Add failing cases: `sixShotsSumTo900FramesAt30Fps`, `rejects25Shots`, `rejects121SecondPlan`, `rejectsFractionalFrames`, `allowsRepeatedAssetWithDistinctShotIds`, `rejectsDuplicateShotId`, `approvedCopyPreservesUnicodeAndOrder`, `rejectsOmittedOrDuplicatedScriptSegment`.
- [x] Run `pnpm exec vitest run test/video/storyboardSchema.test.ts test/video/storyboardCopy.test.ts test/video/storyboardRecipes.test.ts`; establish intended failures, not harness/import failures.
- [x] Implement Zod structures and deterministic validation, including ordered script coverage, copy cue references and required-versus-explicitly-omitted audio. Separate plan timing from measured media bounds; do not coerce invalid durations to defaults.
- [x] Define the versioned shared recipe contract (typed defaults/constraints, roles and semantic controls) plus optional pinned recipe/resolved values on the plan. Retain compatibility for manual plans and existing recipe consumers; execution capability/pricing remain server-registry-owned. Add invalid-default, unknown-control and revision-preservation cases to the schema suite.
- [x] Re-run the same tests. Record contract decisions and complete pre-commit review before committing this unit.

**Receipt:** [Source, checks and bounded scope](../../video/implementations/2026-11-04-storyboard-contracts.md). The core input contract is complete locally; downstream authority/resolver types are assigned above to T05/T06/T08. This is not R1 acceptance.

### T02 — Protect timeline persistence against concurrent writes

**Files:** modify `server/utils/audio/projects.ts`, timeline GET/PUT, versions/render snapshot routes, `app/composables/useMediaProjectEditor.ts`, `app/types/index.ts`; additive migration for `media_timelines.edit_revision`; tests `test/audio/timelineRevision.test.ts`, `test/app/mediaEditorSaveConcurrency.test.ts`.

**Interfaces:** timeline reads return `editRevision`; writes consume `expectedTimelineId` and `expectedEditRevision`. Add `saveDraftTimelineIfCurrentIn(db, { projectId, timelineId, expectedEditRevision, state }): Promise<MediaTimeline>`; mismatch throws 409. Use a project lock for timeline-pointer changes. Legacy write bodies without preconditions return refresh-required conflict.

- [ ] Add failing tests for two writers at revision 0 (exactly one commits revision 1), pointer changes during save, stale render/version snapshot, missing revision, ownership denial and autosave arriving after a newer edit.
- [ ] Run `pnpm exec vitest run test/audio/timelineRevision.test.ts test/app/mediaEditorSaveConcurrency.test.ts`. Implement the additive migration and compare-and-swap boundary for all active-timeline writers, including version/render helpers; reuse existing transactions and God-mode coordination.
- [ ] Serialize client saves, retain dirty edits on conflict and provide explicit reload/recovery. Flush pending saves before version/render/apply actions. Update callers/tests together; do not leave an unguarded compatibility route.
- [ ] Apply the actual migration automatically to the verified intended database using the repository procedure. First establish target provenance and test it on an isolated Neon branch; never print connection secrets. Record the database target and migration receipt.
- [ ] Re-run `pnpm exec vitest run test/audio/timelineRevision.test.ts test/app/mediaEditorSaveConcurrency.test.ts test/audio/timelineSchema.test.ts test/audio/renderVideoApi.test.ts`. Review old audio/AV reads and missing-token recovery before committing.

### T03 — Persist storyboard revisions and approved references

**Files:** create store/access/references/policy modules, GET storyboard/revision and PUT reference routes under `server/api/agency/video/projects/[id]/storyboard/`; additive storyboard migrations; tests `test/video/storyboardStore.test.ts`, `test/server/api/videoStoryboardAccess.test.ts`, `test/video/storyboardReferences.test.ts`; modify God-mode mutation-family registration.

**Interfaces:** `getStoryboard(projectId)`, `saveStoryboardRevision({ projectId, expectedRevision, operationId, plan, actor })`, `resolveReferenceSet({ projectId, revisionId, actor }): Promise<ResolvedReferenceSet>`. Define `ResolvedReferenceSet` in shared contracts as canonical bindings plus approval records/findings. New reads use the existing project access rule without performing write side effects.

- [ ] Add tests for revision pointer races, same-key replay/different-body conflict, wrong-client asset IDs, unauthorized historical reads, unknown rights, explicit usage approval, revocation and changed brand-kit hash.
- [ ] Run `pnpm exec vitest run test/video/storyboardStore.test.ts test/server/api/videoStoryboardAccess.test.ts test/video/storyboardReferences.test.ts` before implementation.
- [ ] Create PRD records with FK/unique constraints, including server-owned timeline obligations; keep copy data inside revision JSON and application receipts immutable. Resolve canonical asset/source IDs on the server, pin revisions/hashes, keep project usage approval separate from source-generation approval.
- [ ] Add default-off feature gating via Cloudflare bindings/local fallback and ledger family registration. Keep staff idempotency in canonical storage rather than relying on the owner-only ledger. No arbitrary remote fetching in asset resolution.
- [ ] Execute/record migrations as in T02; run suites and isolated-DB transaction tests. Record actual migration filenames and verify existing assets were not copied or globally approved before committing.

### T04 — Generate and revise reviewable plans

**Files:** create planning/copy modules, POST `/plan` and `/revisions`; modify recipe definitions; tests `test/video/storyboardPlanning.test.ts`, `test/server/api/videoStoryboardPlanning.test.ts`.

**Interfaces:** `buildStoryboardPlanningContext({ actor, projectId, request }): Promise<PlanningContext>`; `createStoryboardCandidate(context: PlanningContext): Promise<StoryboardPlan>`; store candidate/result against operation ID without advancing the active revision until `/revisions` is accepted. Define request/context types locally and reuse T01 plan/copy types.

- [ ] Add tests for approved-script preservation, invented price rejection, malicious asset-title instructions, invalid asset IDs, repeated source use, total-duration mismatch, one repair maximum, manual-only operation without AI availability, and failed revision preserving the old plan.
- [ ] Run `pnpm exec vitest run test/video/storyboardPlanning.test.ts test/server/api/videoStoryboardPlanning.test.ts` with mocked provider responses.
- [ ] Route text planning through existing model policy/telemetry, using only server-authorized inventory and current copy. Expand dealer offer/product reveal/brand story into structural guidance while retaining the existing legacy recipe consumers.
- [ ] Return a candidate plus readiness findings; require explicit acceptance of the revision diff. Add a human-authored plan path with the same validation and an explicit `approveCopy` action; derive approval actor/time on the server and reject AI-supplied approval fields. No generation or timeline side effects.
- [ ] Implement validated versioned definitions through the existing recipe catalogue. Test every visible control/default against its plan output, including empty optional directions, unsupported controls, one primary camera movement and visual-look terminology. Label prompt suggestions accurately; no saved-plan mutation when a recipe changes.
- [ ] Re-run suites plus `test/app/videoProducerRecipes.test.ts` and `test/video/aiAssembly.test.ts`; review prompts and failure copy, then commit.

### T05 — Resolve assets and compile a complete timeline

**Files:** create `resolve.ts`, `shared/video/storyboardCompile.ts`, POST `/resolve`, and tests `test/video/storyboardResolve.test.ts`, `test/video/storyboardCompile.test.ts`; update timeline schema only for optional provenance that must survive persistence.

**Interfaces:** `resolveStoryboard({ actor, projectId, revisionId, formats }): Promise<ResolvedStoryboard>`; `compileStoryboard(resolved: ResolvedStoryboard): StoryboardCompileResult`. Compiler is pure and emits the current `TimelineState`; use deterministic clip IDs derived from plan revision, shot and cue identity. Resolve data carries measured duration/bounds and approved binding identity.

- [ ] Add tests for six shots/900 frames, two uses of one source, frame-to-second conversion, short footage, unmeasured media, unresolved voice timing, explicit no-music, required overlay absent, caption cues outside speech, valid multi-lane output and deterministic IDs.
- [ ] Run `pnpm exec vitest run test/video/storyboardResolve.test.ts test/video/storyboardCompile.test.ts` to establish failures.
- [ ] Resolve existing asset rows and owned storage metadata; use existing media preparation/probing infrastructure where needed, never fabricate durations from prompts. Bind selected voice/music, reviewed caption cues and Banner overlays. Block incomplete required cues; do not auto-generate them.
- [ ] Compile video/stills, voice/music/SFX, caption and overlay tracks using exact frame-derived timing. Emit server-owned required-cue/source obligations separately from client-visible provenance. Preserve clip metadata through schema/edit operations, but never rely on it to discover whether required copy exists. Manual changes mark only affected approvals stale; selection/zoom changes do not.
- [ ] Run suites plus `test/audio/timelineSchema.test.ts`, `test/audio/timelineEditAv.test.ts`, `test/video/aiAssemblyTimeline.test.ts`. Verify round-trip provenance and existing legacy timelines before committing.

### T06 — Apply atomically and recover by receipt

**Files:** create `apply.ts`, POST `/apply`, GET `/applications/[operationId]`; integrate `server/utils/audio/projects.ts` and ledger families; tests `test/video/storyboardApply.test.ts`, `test/server/api/videoStoryboardApply.test.ts`.

**Interfaces:** `applyStoryboard({ actor, projectId, operationId, revisionId, expectedTimelineId, expectedEditRevision, replaceConfirmed }): Promise<StoryboardApplicationReceipt>`; `getStoryboardApplication({ actor, projectId, operationId }): Promise<StoryboardApplicationReceipt | null>`. The canonical transaction owns checkpoint, state, revision and receipt; it does not nest independent helper transactions.

- [ ] Add tests: duplicate same-body receipt replay, conflicting fingerprint, stale plan/timeline/pointer, no replacement confirmation, inaccessible source, checkpoint failure, application write failure, and committed response lost then recovered.
- [ ] Run `pnpm exec vitest run test/video/storyboardApply.test.ts test/server/api/videoStoryboardApply.test.ts`; include real isolated-DB transaction races as well as unit coverage.
- [ ] Prepare dependencies outside the lock; re-check all mutable approval/dependency revisions inside the committing transaction using the same mutation locks/version preconditions as T03. Compile only authorized resolved data. Save the prior cut as a recoverable version without invoking provider APIs.
- [ ] Atomically persist the new edit and its server-owned obligations, increment revision, map shots to clips and save the fingerprinted receipt. Prior checkpoint/version retains its own obligation lineage. Repeated apply with the same operation returns original result. A deliberate later reapply uses a new operation and fresh preview/preconditions.
- [ ] Re-run suites and inspect rollback paths. Verify ordinary staff and owner-ledger replays converge on the same canonical receipt before committing.

### T07 — Add storyboard editing and one-step timeline adoption

**Files:** create client/composable/components in the map; integrate existing workbench, producer rail and `app/pages/agency/audio/projects/[id].vue`; update editor composable; tests `test/components/videoStudioStoryboard.test.ts`, `test/components/videoStudioShotInspector.test.ts`, `test/app/videoStoryboardApply.test.ts`.

**Interfaces:** `useVideoStoryboard(projectId)` exposes plan/revision/readiness, candidate acceptance, reference editing, resolve/apply and receipt recovery. `adoptCommittedStoryboard(receipt, beforeState)` updates the editor state/revision and undo stack exactly once without autosaving the same commit again.

- [ ] Read the required frontend-design skill. Add failing tests for empty state/recipe flow, keyboard reorder, exact-copy editing restrictions, missing-media blockers, revision diff, non-empty replacement confirmation, disabled actions and loading/error recovery.
- [ ] Run `pnpm exec vitest run test/components/videoStudioStoryboard.test.ts test/components/videoStudioShotInspector.test.ts test/app/videoStoryboardApply.test.ts`.
- [ ] Implement the Storyboard view within Produce; reuse library selection and inspector patterns. Add reference-role mapping, exact-copy fields, duration totals, format selection and clear ready/missing/review states. Hide unsupported production actions in R1.
- [ ] Add a small authorized example catalogue with recipe/evaluation revision and status. Test local-only prefill (zero AI/production/save requests), sample-copy labelling, inaccessible/cross-client inputs, stale evidence and explicit draft-change preview. Require fresh planning/production actions; no imported approvals or automatic apply.
- [ ] Flush/await autosave, pause edits during apply, keep one stable operation ID through retry/receipt lookup, and adopt confirmed server state as one undo step. Preserve local state on 409; recover committed results after a timeout. Track timeline divergence without automatic two-way synchronization.
- [ ] Re-run suites plus `test/components/videoStudioWorkbench.test.ts`, `test/components/videoStudioProducerRail.test.ts`, `test/components/mediaTimelineInteractions.test.ts`. Browser-check keyboard operation, 390px/768px/1440px widths, dark/light modes and bounded scroll before committing.

### T08 — Preserve exact copy and current eligibility through rendering

**Files:** create `renderValidation.ts`, `timelineReview.ts`, POST `/timeline-review`; modify `server/api/agency/audio/projects/[id]/render-video.post.ts`, timeline PUT/version helpers, `server/utils/audio/bannerOverlay.ts`, the existing Review-mode UI and render/worker integration; tests `test/video/storyboardRenderValidation.test.ts`, `test/audio/storyboardRender.test.ts`, `test/components/videoStudioAdjustedEditReview.test.ts`.

**Interfaces:** `validateStoryboardRender({ actor, projectId, timelineId, editRevision, formats }): Promise<ReadinessFinding[]>` loads server-owned state and obligations. `reviewAdjustedTimeline({ actor, projectId, operationId, expectedTimelineId, expectedEditRevision, obligationMappings, copyRevisionId }): Promise<StoryboardTimelineReview>` validates and records review without replacing clips. Both reject stale/revoked dependencies even if new storyboard actions are disabled; reviewing an existing edit remains available as a recovery action when the entry flag is off.

- [ ] Add failing cases for long disclaimer, missing font, square/landscape overflow, changed shared banner, edited caption/copy mismatch, revoked source after apply and changed generation approval. Direct-save cases delete required clips, strip metadata, hide/mute tracks, set zero opacity or move copy outside output; all retain server obligations and block rendering.
- [ ] Test trim/reorder/replacement → affected-only review → successful render without storyboard reapply; rejected invalid-copy approval; copy-revision acceptance; 409 during review; version restoration and flag-off paths retaining obligations. Test the Review UI preserves all manual edits.
- [ ] Run `pnpm exec vitest run test/video/storyboardRenderValidation.test.ts test/audio/storyboardRender.test.ts test/components/videoStudioAdjustedEditReview.test.ts`.
- [ ] Reuse Banner Studio layout/render linting; add exact-copy measurement where current linting is insufficient. Preserve the full supplied string; no ellipsis/substring fallback for required copy. Resolve each requested format independently and pin the validated render inputs. Integrate ordinary saves/restores with server-owned obligation status; metadata omission is not an exemption. Build **Review adjusted edit** to approve corrected mappings/timing/layout or an explicitly approved new copy contract while preserving the cut.
- [ ] Re-check current approval/eligibility at dispatch and record an immutable render manifest. Pass immutable approved inputs to the container. Prevent queued work from publishing a newly revoked result; keep content provenance and display/export eligibility distinct.
- [ ] Render fixture outputs in all three formats and inspect actual frames/audio. Re-run `test/audio/videoCompositeGraph.test.ts`, `test/audio/videoCompositeGraphSync.test.ts`, `test/audio/renderVideoApi.test.ts`. Record preview/render differences before committing.

### T09 — Complete R1 acceptance, public documentation and rollout

**Files:** update `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, relevant MarketingNav/SEO references; create `docs/runbooks/video-storyboard-producer.md` and `docs/video/releases/2026-11-04-storyboard-r1/README.md` as an evidence index, updating the release date if execution occurs later.

**Interfaces:** release record lists exact source/main/deployment IDs, migration receipts, flag configuration, test/browser/render artifacts and A1–A8/A13 outcomes. Each acceptance row starts pending and links evidence when completed.

- [ ] Run A1–A8/A13 using dealer offer, product reveal and brand-story fixtures; include ordinary staff, owner, wrong-client and two-tab sessions. Verify audio-only and old AV projects, manual source generation, overlays, captions, versions, library saves, portal/social entry points and QR Codes/navigation without sending externally unless authorized.
- [ ] Record R1 example/recipe evidence for our own authorized dealer offer/product/brand fixtures. Bind recipe/source revisions, input eligibility and actual rendered copy checks; distinguish runnable, eligible and reviewed. Stale or replacement examples start unreviewed; do not borrow Freefield showcase assets.
- [ ] Measure pilot baseline and completion/time targets. Record findings honestly; unfinished hosted/user criteria keep release acceptance open.
- [ ] Run focused suites from T01–T08, repository CI checks, relevant lint/typecheck and `pnpm build`. Attribute existing errors separately and block newly introduced failures. Do not claim a baseline issue is harmless without evidence.
- [ ] Finish runbook/marketing copy for R1 capabilities only. Record flag-off behavior, preserved data and compatible rollback artifact; verify flag-off does not weaken provenance checks on already-created content.
- [ ] Fetch/reconcile latest main, review the complete diff, run `pnpm deploy:check`, then use guarded deployment commands for the authorized environment. Start with an isolated preview and selected internal pilot; production activation requires the release process's applicable authority. Link hosted render and operator evidence separately from CI.
- [ ] Mark R1 accepted only when the recorded criteria pass. Retire this release's merged branch/worktree only after accounting for unrelated work.

## R2 — Reviewed shot production

### T10 — Establish take approvals and safe production accounting

**Files:** create `production.ts`, `productionBudget.ts`, `productionPolicy.ts`; extend existing generation job/budget/reconciliation modules and additive migrations; tests `test/video/storyboardProduction.test.ts`, `test/video-generation/storyboardBudget.test.ts`.

**Interfaces:** `ShotProductionAttempt` contains project/shot/revision/input hashes, stage, selected model, currency, estimated/reserved/reported cost, provider job identity and review state, plus a protected normalized request/fingerprint, recipe revision, provider/model revision when available, actual seed when supported/reported, artifact roles/hashes and stage timestamps. Unknown values remain explicit; exact replay is not promised. `reserveShotAttempt(input): Promise<ShotProductionAttempt>` and `approveShotArtifact({ attemptId, artifactHash, expectedShotRevision, actor }): Promise<ShotProductionAttempt>` reuse the existing generation job as the canonical video request. New accounting supplements its liabilities instead of creating a second independently spendable budget.

- [ ] Test simultaneous project/tenant reservations, idempotency fingerprint mismatch, rate changes, image approval invalidation, unreported charge, charged failure, cancellation and timeout after provider acceptance.
- [ ] Run `pnpm exec vitest run test/video/storyboardProduction.test.ts test/video-generation/storyboardBudget.test.ts` before implementation.
- [ ] Add durable attempts/approval records and project allowance checks. Extend canonical spend accounting to include unresolved/charged liabilities across existing policy and reservation queries; do not simply change UI totals. Record estimate versus actual explicitly.
- [ ] Test resolved-default/actual-seed capture, unknown provider metadata, access restrictions and content-free logs. Recreate settings only as a new quoted/authorized attempt; no free-reroll or default extra-take assumption.
- [ ] Pin approval to artifact, shot, reference and copy revisions. Require new reviewed authorization for a changed request/new take; never replay uncertain paid requests as fresh work. Apply migrations and isolated-DB race checks under the established procedure.
- [ ] Run new suites plus `test/video-generation/budget.test.ts`, `test/video-generation/policy.test.ts`, `test/video-generation/reconcile.test.ts`; review recovery and costs before committing.

### T11 — Coordinate image review and generation with existing providers

**Files:** add `workers/agency-workflows/src/videoStoryboardProduction.ts`, integrate its index/contracts/config and existing control-plane route conventions; add shot-production start/status/approve/cancel routes under the storyboard API; integrate canonical generation submission/reconciliation and `server/utils/video-generation/finalize.ts`. Tests: `test/video/storyboardWorkflow.test.ts`, `test/server/api/videoStoryboardProduction.test.ts`.

**Interfaces:** workflow input `{ projectId, attemptId }`; authenticated events carry attempt ID, expected state/revision and artifact/provider identity. Server resolves all sensitive request data. Workflow transitions call T10/canonical job services, never insert directly into an alternate media/job pipeline.

- [ ] Verify current official Cloudflare Workflows APIs, SDK/config and the repository control-plane pattern. Record the selected binding and deployment target in the implementation receipt; default production flag remains off.
- [ ] Test restart at every boundary, duplicate/forged/stale approval, callback before wait registration, lost callback, uncertain submit, unsupported image model, tenant disabled and flag disabled mid-run.
- [ ] Run `pnpm exec vitest run test/video/storyboardWorkflow.test.ts test/server/api/videoStoryboardProduction.test.ts` to establish failures.
- [ ] Implement selected/uploaded image → review → supported video generation → reconciliation → take review. Image generation is capability-gated; no unsupported multi-reference input is silently discarded. Use the platform's Cloudflare AI Gateway routes only.
- [ ] Separate safe polling/recovery retries from paid submissions; reconcile by attempt/provider identity after uncertainty. Bound event waits and surface stalled jobs. Store media in existing R2/assets; preserve rejected and late outputs without choosing them automatically.
- [ ] Add explicit artifact roles and bounded media probing/storage to canonical finalization; missing final output fails closed. Resolve the existing webhook/reconcile duplicate-asset window using durable identity/uniqueness and recovery. Preserve a retryable finalization stage without releasing uncertain spend or resubmitting generation. Use the existing media Worker/container for work beyond Pages limits. Test concurrent finalize, crash after upload/asset insert, wrong media type, oversized/truncated result and diagnostic-only output.
- [ ] Expose measured queue/provider/transfer/probe/storage stages, with indeterminate progress where appropriate and readiness only after durable registration. Map recipe controls through provider capability checks; test unsupported controls, optional enhancement with reviewed diff and approved-copy/product-fact preservation. Extend `test/video/storyboardWorkflow.test.ts` and `test/server/api/videoStoryboardProduction.test.ts` plus focused finalization coverage in `test/video-generation/storyboardFinalize.test.ts`.
- [ ] Re-run suites, `test/video-generation/storyboardFinalize.test.ts`, generation worker/provider tests and workflow dry-run/build checks. Validate a controlled authorized provider run before enabling the capability, recording receipts and actual media separately from mocked tests.

### T12 — Ship shot previews, alternate takes and R2 acceptance

**Files:** create `VideoStudioShotProduction.vue`; extend storyboard/inspector/composable, runbook, marketing and release evidence index; tests `test/components/videoStudioShotProduction.test.ts`.

**Interfaces:** uses T10 attempt states/T11 endpoints. A chosen approved take updates a new storyboard revision; replacing an existing timeline clip remains a separate explicit editor operation.

- [ ] Test preflight cost/allowance display, image approval, dependency-change invalidation, unknown cost/status, cancellation, replayed requests, rejected take preservation and late output after shot deletion.
- [ ] Run `pnpm exec vitest run test/components/videoStudioShotProduction.test.ts`; implement Nuxt UI review controls, previews, compare/select take, provider progress and recovery actions.
- [ ] Implement synchronized source/result and take comparison: common elapsed seconds, shared seek/play, explicit audio selection, duration/resolution differences and shorter-clip freeze instead of independent loops. Test unequal durations, seek/end handling and rejected-take access. Keep Nuxt UI and keyboard controls.
- [ ] Add “Use in shot”/eligible existing-tool prefill with explicit input roles, canonical IDs, lineage and server eligibility recheck. Test wrong-client, revoked and unsupported targets, no paid submission and no timeline replacement. Wider tool chaining remains deferred.
- [ ] Create a versioned evaluation record for each promoted recipe/model using authorized product/vehicle/brand fixtures. Review full clips for identity/geometry, badging, unwanted text/logos, motion, temporal consistency and audio, then composed exports for copy. Record pass/fail findings with artifact hashes, cost, evaluator and date; new/replaced revisions start unreviewed. Execution success alone cannot promote a recipe or approve a take.
- [ ] Complete A9/A10/A14/A15 with a controlled paid fixture under an explicit project allowance; inspect returned media and verify receipt reconciliation after refresh/restart. A completed job alone is insufficient.
- [ ] Repeat applicable R1 regression/hosted checks and rollout procedure from T09. Update public copy only for verified R2 capabilities; document unavailable models and staged activation. R3 remains off.

## R3 — Continuity and directed audio

### T13 — Continue from an approved raw frame

**Files:** create continuity service/container helper; integrate container dispatch, source registry and shot inspector; tests `test/video/storyboardContinuity.test.ts`, `test/audio/continuityFrame.test.ts`.

**Interfaces:** `prepareContinuitySource({ projectId, previousAttemptId, expectedRawHash }): Promise<{ sourceAssetId: string; frameHash: string; findings: ReadinessFinding[] }>`; `invalidateDependentTakes({ projectId, changedShotId, previousRevision }): Promise<string[]>` returns affected attempt IDs without submitting work.

- [ ] Test cut/continue/new-scene choices, wrong-client source, missing raw footage, stale approval, last decodable frame, black/white/blank output, unsupported model and transitive downstream invalidation.
- [ ] Run `pnpm exec vitest run test/video/storyboardContinuity.test.ts test/audio/continuityFrame.test.ts` against bounded local fixtures.
- [ ] Extract/hash the actual last decodable frame using the existing container; attach it through the canonical approved-source path with provenance and explicit review. Keep caption/overlay exports out of the continuation chain.
- [ ] Implement dependency tracking and targeted stale-state warnings; require review/new authorization before regeneration. Unsupported continuation offers an explicit cut choice, never an automatic substitute.
- [ ] Complete A11 with controlled provider footage and human visual review. Record product/character consistency failures independently of successful frame hashing. Run relevant generation/composite regressions before committing.

### T14 — Direct audio and finish R3 acceptance

**Files:** create `audioDirection.ts`; integrate current voice/music/SFX/caption paths and storyboard revisions; tests `test/video/storyboardAudioDirection.test.ts`, `test/audio/storyboardAudioRender.test.ts`; update runbook/marketing/release evidence.

**Interfaces:** `resolveShotAudio({ projectId, revisionId, measuredTakes }): Promise<{ cues: ResolvedStoryboard['audioCues']; findings: ReadinessFinding[] }>`; define top-level resolved audio cues in T01 as the flattened, authorized equivalent of shot cues. New generation uses the same durable attempt/allowance principles as R2.

- [ ] Test explicit silence, continuous ambience, measured speech overflow, voice guard changing locked copy, unsupported alignment, missing usage approval, and revision limited to selected shots.
- [ ] Run `pnpm exec vitest run test/video/storyboardAudioDirection.test.ts test/audio/storyboardAudioRender.test.ts`.
- [ ] Reuse eligible library assets first; generate only explicitly selected missing audio through existing approved integrations. Preserve exact speech and source rights evidence. Require reviewed timing/alignment before caption burn-in; never label approximate timing verified.
- [ ] Integrate targeted plan diffs and affected-dependency selection with no automatic overwrite of approved takes or manual timeline edits. Compile through T05 and apply through T06.
- [ ] Complete A12 and repeat A1–A11/A13–A15 where affected, including real rendered audio/video inspection. Measure pilot outcomes, update public copy truthfully and follow T09's source/deployment/evidence controls for R3 activation.

## Acceptance coverage and evidence rules

| Requirement | Owning tasks | Acceptance |
|---|---|---|
| P1 workspace | T07 | A1, A2, A8 |
| P2 planning/revisions | T01, T03, T04 | A1–A3 |
| P3 exact script/copy | T01, T04, T05, T08 | A3, A7 |
| P4 references/access | T03, T08 | A4 |
| P5 full assembly/recovery and adjusted-edit review | T02, T05–T08 | A5, A6 |
| P6 staged production | T10–T12 | A9, A10 |
| P7 continuity | T13 | A11 |
| P8 audio direction | T14 | A12 |
| P9 recipes/examples (R1) | T01, T04, T07, T09 | A13 |
| P9 production evidence/comparison (R2) | T10–T12 | A14, A15 |
| Metrics/marketing/rollout | T09, T12, T14 | Pilot measurements and release receipts |

No checkbox becomes complete from documentation alone. Per-task receipts record source SHA, files/migrations, exact checks, results, unresolved limitations and next dependency. Keep planned and verified outcomes distinct. This plan intentionally starts with R1; R2/R3 tasks are sequenced follow-on work and must be revalidated against current source/provider contracts before execution.

### Planning review — 4 November 2026

A fresh builder review identified two material gaps: client-removable provenance could bypass required-copy checks, and manual edits lacked a route back to approved rendering. The PRD/contracts/tasks now require server-owned timeline obligations and a revision-checked adjusted-edit review. Follow-up review found both issues resolved and no remaining important planning questions. This is document review evidence only; all implementation and runtime acceptance remain pending.

### Freefield research update — 4 November 2026

Source findings are recorded in the linked R&D report. T01/T04/T07/T09 own the bounded R1 recipe/example additions; T10–T12 own R2 request evidence, output/finalization, progress, comparison and evaluation. FF-RD01–FF-RD05 remain unstarted separate investigations and cannot be counted as release completion. All new acceptance rows start pending.

A fresh builder review of the Freefield additions found no actionable issues in release boundaries, task/acceptance coverage, output stages or deferred research scope. This is document review only; implementation and runtime evidence remain pending.
