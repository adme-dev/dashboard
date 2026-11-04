# Video Studio Storyboard Producer — PRD

**Date:** 4 November 2026

**Status:** T01–T06 implemented and independently reviewed locally. T07 editor adoption is next. See the [T06 application receipt](../../video/implementations/2026-11-05-storyboard-application.md). R1/R2/R3 acceptance remains pending. See the [T05 implementation receipt](../../video/implementations/2026-11-05-storyboard-resolution.md) and [initial foundation receipt](../../video/implementations/2026-11-04-storyboard-contracts.md).

**Owner:** Creative / Video Studio

**Task list:** [Implementation plan](../plans/2026-11-04-video-storyboard-producer.md)

## 1. Purpose and scope of this decision

Make it possible for an agency producer to turn a brief or approved script into a reviewable storyboard, resolve the required media, and assemble an editable video in the existing Video Studio.

The user requested a PRD/task list following a review of OneMinute-Film. This document carries forward the recommended direction: storyboard planning, approved references and exact-copy overlays first, followed by staged generation and continuity. Release boundaries, limits, interface names and technical choices below are planning recommendations, not claims that the user individually approved each detail.

This is an extension of the existing editor. It does not replace the timeline, asset library, renderer, generation providers, brand kits or client review system. Implementation, provider spend, migrations and deployments have not occurred as part of this planning task.

## 2. Evidence and current state

Source baseline: dashboard `c39b8b7f4a79f73350e2a1c4620075f87881a6c5`, matching fetched `origin/main` on 4 November 2026. Inspiration reviewed: [OneMinute-Film `7fbf100`](https://github.com/shahriarsajeeb/OneMinute-Film/tree/7fbf100f7816a2e7d4b13d34c1aa09d0832651ef). Findings are source observations, not current hosted acceptance evidence.

| Existing source | Verified role / limitation |
|---|---|
| `server/utils/video-asset-intelligence/aiAssembly.ts` | Groq selects, orders and assigns durations to existing bucket items; maximum 12 steps. Voice/overlay/caption requirements are appended as review-only steps. |
| `app/utils/video/aiAssemblyTimeline.ts` | Applies visual `place-asset` steps; other lane requirements are skipped with warnings. |
| `app/components/media/VideoStudioProducerRail.vue` | Existing brief, recipe, draft-plan and apply surface. |
| `app/utils/video/producerRecipes.ts` | Dealer offer, product reveal, brand story, testimonial and event recap recipes. |
| `server/utils/audio/timelineSchema.ts` | Canonical v1/v2 audio/AV timeline, including video, voice/music/SFX, overlays and captions. |
| `app/composables/useMediaProjectEditor.ts` | Timeline edits, undo/redo, autosave, versions, rendering and distribution actions. |
| `server/api/agency/audio/projects/[id]/timeline.put.ts` | Whole-state save; no expected-revision compare-and-swap in the reviewed body. |
| `server/utils/video-generation/{sourceAssets,clientProfile,budget,compliance}.ts` | Source approval, linked brand guides, tenant model/cost policies and vehicle image-to-video requirements. |
| `server/utils/video-generation/budget.ts` | Failed/blocked jobs cease reserving budget; uncertain provider submissions need explicit treatment before storyboard generation is enabled. |
| `app/utils/video/videoStudioAssetGovernance.ts` | Rights labels derive from asset type/source. A label is not recorded approval or verified reuse permission. |
| `workers/audio-jobs/` | Existing container-backed rendering and per-format overlay composition. |

**Additional R&D:** [Freefield source review and separate research backlog](../../research/2026-11-04-freefield-video-rd.md), reviewed at `e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca`. Its recipe/example/comparison and run-quality patterns refine the releases below; its GPU runtime and experimental tools are not selected. No Freefield model jobs were run.

Related historical design: [enterprise redesign](../../specs/2026-06-19-video-studio-enterprise-redesign-prd.md) and [completion task list](../plans/2026-06-19-video-studio-completion-task-list.md). Preserve their established editor features; do not interpret historical checked boxes as acceptance of this new scope.

## 3. Users, jobs and outcomes

- **Producer:** inspect and change the proposed sequence before investing in generation or detailed editing.
- **Account manager:** carry approved offer wording and brand assets into the edit without rewriting or repeated setup.
- **Editor:** receive a normal editable timeline with correctly timed media and a recoverable prior edit.

Primary example: a 30-second dealer offer in 9:16 becomes six timed shot cards, matched vehicle assets, an approved voice script and exact offer/CTA overlays. Missing footage is visible. The producer can use another approved asset or, in Release 2, generate the missing shot. The final edit remains editable and can use existing export/review actions.

Success targets for the pilot, to be measured rather than assumed:

- At least 4 of 5 pilot operators complete brief → storyboard → existing-media timeline without developer assistance.
- Median time to a saved first assembly improves by at least 30% against a recorded manual baseline using the same three fixture briefs. Exclude provider waiting time and report it separately.
- Every approved-copy fixture preserves exact text through plan revision and server render; no silent clipping or invented prices.
- Repeated apply requests insert nothing twice; concurrent edits are rejected without data loss.
- Release 2 fault-injection tests produce no duplicate paid submission from retries, refresh, duplicate callbacks or approval replays.

## 4. Release boundaries

| Release | Product outcome | Explicit boundary |
|---|---|---|
| **R1: Storyboard and existing-media assembly** | Editable shot cards, reference sets, copy/script protection, persistent revisions, resolved multi-lane assembly, one-step undo and recovery. | No new image/video/voice/music generation is automatically invoked by this workflow. Existing standalone generation tools remain available; their completed assets can be selected. Text planning uses the existing approved AI route. |
| **R2: Reviewed shot production** | Create/reuse a starting image, approve it, generate a selected take, review it and attach it to the shot; per-attempt budget/status/recovery. | Supported Cloudflare AI Gateway models only; unavailable image capabilities use uploaded/selected references. No new provider required. |
| **R3: Continuity and directed audio** | Approved final-frame continuation, explicit cuts, shot-aware voice/audio cues and targeted revisions with dependency warnings. | Conditional on provider capability and measured media evidence; no claim of guaranteed identity or lip-sync. |

Each release has its own acceptance and rollout. R1 must remain useful and releasable without R2/R3.

Out of scope: a new editor/render engine, a Next.js port, importing OneMinute-Film source, provider shopping, voice cloning, automatic social publishing, automatic client submissions, long-form film production, advanced motion tracking, new transition/effect engines and multi-user real-time editing. Reuse permission would need establishing before any third-party code copying. No licence file was found in the reviewed OneMinute-Film checkout. Freefield has an MIT code licence; this does not settle its model, asset or output terms.

## 5. R1 product requirements

### P1 — Entry and editing surface

Add a Storyboard view to Produce within the existing workbench. Retain Assets/Edit/Produce/Review navigation and access to the timeline. Use the existing inspector for the selected shot; avoid another page-length producer panel.

The empty state offers an existing recipe, a new brief or an approved script. Targets default to 15, 30 or 60 seconds; custom duration is allowed up to 120 seconds. Support `reels_9x16`, `square_1x1` and `youtube_16x9`. R1 plans have 1–24 shots at the project's frame rate. Repeated use of the same asset in different shots is valid.

Each shot displays sequence number, purpose, thumbnail/placeholder, duration, visual direction, asset resolution, reference set, spoken lines and exact on-screen copy. Operators can add/delete/reorder shots, edit duration, assign/replace assets and revise directions. Supply keyboard move-up/down controls as well as drag operations. All panels have bounded scrolling, usable narrow layouts and dark-mode styling. Nuxt UI v4 is mandatory; read the project-required frontend-design skill before implementing forms.

### P2 — Structured planning and revision

The server produces a validated plan from brief, recipe, target format/duration, approved copy and an authorized asset inventory. Use the existing model-routing layer. Treat asset metadata and brief text as data, never instructions to bypass tenancy, copy locks or capabilities.

Persist the initial plan and subsequent revisions. Stable shot IDs survive revisions when the shot is unchanged. Show a revision diff before replacing the editable draft. An AI response never directly modifies a timeline or starts media production. Malformed, out-of-scope or unverifiable output leaves the prior revision intact; permit one bounded repair call, then expose an actionable error and manual editing. A deterministic fallback, if offered, must be labelled as such.

Durations are integer frame counts; the sum must equal the requested plan duration. Keep available media duration separate from planned duration. Do not silently stretch footage, repeat it, speed speech or truncate audio to make a plan fit. Missing/short media blocks full assembly until resolved or the plan is deliberately revised.

### P3 — Approved script and exact-copy contract

Two modes: `idea` permits draft narration suggestions; `approved_script` keeps the supplied script immutable to AI. Store verbatim text as identified segments with a revision/hash. Shots reference ordered segment IDs; splitting assignments must preserve order and full coverage. AI cannot paraphrase, omit, duplicate or invent approved spoken lines. Human edits create a new copy revision and invalidate affected approvals; they do not mutate an approved revision in place.

Exact on-screen copy is separate from visual prompts. Prices, offer conditions, disclaimers, model names and CTA wording come from an operator-approved copy revision. AI can suggest placement, never infer missing financial/product facts. Missing offer facts remain unresolved fields. Existing voice guard transformations must be surfaced as a copy change requiring review, never treated as faithful approved speech.

Render exact copy with existing Banner Studio projects. Keep generated pixels free of required text/logos. Resolve every requested format to its own overlay layout, validate font availability, safe areas and overflow, and block export when required copy would be cropped, shortened or omitted. Edits to an underlying shared banner/brand kit do not silently update an already approved plan: pin revision/content hashes and mark changed dependencies stale. Editing a shared banner requires explicit intent; project-specific revisions use an owned copy through existing APIs.

Required-copy obligations belong to a server-owned application/timeline lineage, independently of optional clip metadata. Each obligation identifies the approved copy cue, required presence, approved visibility/timing/layout and mapped clips. Deleting a clip, stripping provenance, hiding/muting its track, setting opacity to zero or moving it outside the output cannot erase the requirement. A deliberate change to required content needs a new human-approved copy revision; version restoration restores that version's obligations. This enforcement also applies to direct timeline-save requests and flag-off rendering.

### P4 — References and assets

A project reference set maps roles (`product`, `presenter`, `location`, `style`) to existing canonical asset/source IDs and brand-kit revision/hash. Product references for dealer work retain the exact vehicle/product association. Textual style guidelines supplement references; they cannot prove visual fidelity.

Server resolution checks project access, client scope, source existence, readiness and recorded approval. Unknown rights/approval remain unknown. An authorized producer may record project-specific usage approval with actor/time/revision and an evidence note; this is separate from generation source approval and does not silently approve an asset in another system.

Store references and provenance, not duplicate binary media or expiring signed URLs. Derivatives inherit their source chain, not automatic approval. Revocation, deletion or changed content invalidates new apply/generation/render attempts and shows the affected shots; historical versions remain inspectable. Already-downloaded exports cannot be recalled and must not be described as revoked remotely.

### P5 — Resolve and apply the full edit

R1 binds already-produced video/stills, voice/music assets, caption cues and Banner Studio overlays. A narrated plan needs a selected matching audio asset and reviewed timing; a duration estimate is not alignment. Caption timing may be manually confirmed or supplied by verified cues. A single transcript/VTT cue is not word-level alignment. No captions are fabricated when timing is unavailable.

The default operation creates a complete proposed cut. On a non-empty timeline, show exactly what will be replaced and require the existing Nuxt UI confirmation pattern. No silent append, merge or partial apply. Missing required media, copy, timing, approval or format readiness blocks apply with shot-specific reasons. Optional music/SFX must be explicitly omitted or resolved, never silently dropped.

Flush pending edits, hold local editing while applying, and compare expected storyboard revision plus timeline ID/revision on the server. In one transaction: validate dependencies, checkpoint the prior timeline, save the new timeline, record shot-to-clip mappings and write an application receipt. A stale revision returns 409 without modifying either edit. A repeated operation ID with identical input replays the receipt; changed input with that ID returns 409.

Adopt the committed state in the editor as one undo step without another autosave. Undo/redo use the normal revision-checked save flow. A timeout leads to receipt lookup, not a fresh apply. Refresh restores the committed timeline and application record; the saved checkpoint provides recovery after the in-memory undo stack is gone. Manual timeline edits do not back-propagate into the storyboard: show that the edit has diverged and offer an explicit new apply with a fresh replacement preview.

Manual editing remains a supported route to a finished video. Selection/zoom changes do not invalidate content approval. Trim/reorder/timing/layout edits invalidate affected timing/layout review; replacing media invalidates that binding's usage/content review; changing script/required copy needs a new approved copy revision. The server compares submitted state with its obligation record and maintains affected-review status; removing client provenance does not detach the edit from its obligations. Other approved takes and unaffected obligations remain valid.

Provide **Review adjusted edit** in the existing Review mode. It shows the changed clips/cues and supports explicit remapping of a required cue to a replacement clip. The server checks exact content, asset eligibility, required presence and layout/timing against the current timeline revision, then records the reviewed render manifest. Invalid required content cannot be approved away; correct it or explicitly approve a revised copy contract. This action preserves manual edits and does not reapply the storyboard. Concurrent changes return 409. Automated preflight and final render inspection still apply after this review.

## 6. R2 and R3 product requirements

### P6 — Reviewed production (R2)

Each take belongs to a shot revision. Separate content review from execution state. States: `not_started`, `queued`, `running`, `unknown`, `needs_review`, `approved`, `rejected`, `failed`, `cancelled`. Preserve all prior takes and their provenance. Successful generation means media exists; it does not mean the take is approved or suitable for rendering.

Start with a selected/uploaded approved image. Add image generation only if an approved existing provider path supports the necessary inputs. Review the image before video submission. Approval binds actor, shot revision, reference/copy revisions and image hash. A changed dependency expires approval. Never accept a late completion as the current take after the shot changed. Replacing a storyboard take does not silently replace an already edited timeline clip.

Quote the selected model and billable duration separately from desired editorial duration. Reserve each paid request under both the existing tenant cap and a project production allowance; re-check price/capability before submission. Store estimates and actual reported charges separately, with currency and unknown-cost state. Do not treat provider account balance changes as a job's actual charge.

Write an attempt identity before submitting; persist provider request IDs as soon as available. Ambiguous timeouts enter `unknown`, retain budget reservation and reconcile before any resubmission. Known failed requests can still incur charges: retain recorded/uncertain liability until reconciled. Cancellation stops unsent work; in-flight cancellation does not imply refund. Workflow retry settings alone are not a spend guarantee.

### P7 — Continuity (R3)

Each adjacent shot declares `cut`, `continue` or `new_scene`; default `cut`. `continue` requires an approved preceding raw take, measured end frame and a supported model capability. Decode the exact source bytes in the existing media container, hash the frame and reference it through the canonical source registry. Never use the composited export containing text as the continuation source.

Missing, stale, black/blank or unusable frames require review; no silent fallback to text-to-video. A human checks vehicle/product identity, wardrobe, scene geography and motion. Heuristics and shared references are aids, not proof. Replacing an upstream take marks dependent continuations stale and preserves their outputs for inspection. Regeneration is explicit and limited to selected affected takes.

### P8 — Directed audio (R3)

Translate shot intentions into voiceover, music, ambience and SFX cues on existing track types. Reuse authorized library assets first. Explicit silence suppresses automatic beds. Measure generated audio, distinguish proposed timing from reviewed timing and avoid cutting approved speech. Caption segmentation requires actual alignment or manual timing. Use existing ducking/render facilities only where verified; add focused coverage for any newly exercised path. New provider or voice-cloning integrations are outside this plan.

### P9 — Validated recipes, examples and evidence (R1/R2)

**R1:** Extend the existing producer recipe catalogue with a version, typed defaults/constraints, reference roles and semantic shot controls. Use a shared Zod definition and server validation; preserve existing recipe consumers. Resolve available models/actions from their existing server registries rather than duplicating capability or price authority. Record the chosen recipe ID/version and resolved values in the storyboard revision; manual plans may omit recipe identity. Recipe changes do not mutate saved plans. Test that every exposed control affects its intended plan field; optional empty directions must not erase default instructions. Default to one primary camera movement per shot, labelled as prompt guidance unless the provider explicitly supports a native control. Describe visual characteristics rather than equipment that might appear in generated pixels.

Offer a small set of our own authorized examples for the existing dealer offer/product reveal/brand story recipes. “Use example” only prefills a local candidate and shows the changes; it neither calls a model nor saves/replaces an edit. Sample content is clearly marked and never becomes approved client copy. Assets are re-resolved for the current project; no cross-client references or stale signed URLs. Examples carry recipe revision, evaluation date and reviewed status; stale examples are labelled and cannot certify a new revision. Planning/production retains its separate explicit action.

**R2:** Persist a protected run record on the canonical attempt: normalized request and fingerprint, recipe revision, model/provider revision when available, input asset IDs/hashes, actual seed when supported/reported, output roles/hashes and stage timestamps. Mark unavailable fields unknown; no invented seed or reproducibility guarantee. Keep prompts and asset details out of operational logs. Recreating settings requires current eligibility and a fresh cost authorization. Optional prompt enhancement is recipe-specific, shows its proposed change before submission and cannot rewrite approved copy/product facts; unsupported enhancement stays unavailable.

Separate queue, provider execution, transfer/probe/storage and ready-for-review stages from human approval. Show indeterminate progress when measurements are unavailable; never claim 100%/ready while saving or probing. An expected final artifact must exist, be bounded and media-probed, and be durably registered before success. Explicit roles distinguish final video, preview, source/reference, matte and diagnostic output. Never substitute an arbitrary auxiliary artifact for a missing final result. Webhook/reconciliation retries converge on one canonical artifact and cannot trigger another generation request. Do not expose unsupported multi-output actions merely because the contract can represent them.

Compare two existing takes or a source/result with shared elapsed-time playback and seek, explicit audio selection, resolution/duration labels and a clear shorter-clip end state. Do not independently loop unequal clips. “Use in shot” or an eligible existing tool prefills an explicit input role using canonical IDs and renewed server authorization; it preserves lineage without granting approval, starting work or replacing a timeline clip. Wider tool chaining is deferred.

Maintain a versioned fixture/evaluation record for promoted recipes: runnable, currently eligible, evaluated and human-approved are distinct states. Review entire clips for product/identity drift, unwanted logos, requested versus observed motion, temporal artifacts and audio; validate deterministic copy in actual composed exports. Replacement examples and changed model/recipe revisions start unreviewed. Record execution failures and semantic failures separately. No default extra paid take, automatic reroll or claim of guaranteed OEM fidelity.

## 7. Architecture and contracts

Keep Nuxt 4/Vue/Nuxt UI, Nitro, Neon, R2, existing model routing and the audio-jobs container. Canonical media remains in existing tables/buckets. Storyboard data lives alongside media projects, separate from `TimelineState`; compilation emits the current timeline contract. Add optional producer provenance to clips only if needed for durable mappings, and preserve it through all schema parse/save/edit paths.

Proposed R1 records:

| Record | Required responsibility |
|---|---|
| `video_storyboards` | One active storyboard per project, current revision pointer. |
| `video_storyboard_revisions` | Immutable validated content, parent revision, actor, plan/source/copy hashes. |
| `video_storyboard_reference_sets` | Versioned role mappings, pinned canonical asset IDs and project usage approvals. |
| `video_storyboard_applications` | Operation ID + request fingerprint, target timeline ID, before/after revisions, checkpoint, shot/clip mappings and receipt. |
| `video_storyboard_timeline_obligations` | Server-owned application lineage, required cue/source bindings, review state and manifests per timeline revision; survives client metadata removal and follows saved versions. |
| `media_timelines.edit_revision` | Monotonic compare-and-swap token, separate from user-visible saved version numbers. |

Required shared R1 types in `shared/video/storyboard.ts`:

- `StoryboardPlan`: `schemaVersion: 1`, `id`, `projectId`, `revision`, `fps`, `durationFrames`, `targetFormat`, `inputMode`, `copyRevisionId`, embedded `copy: CopyRevision`, `referenceSetRevisionId`, optional `recipe: { id, version, resolvedValues }`, `shots`.
- `StoryboardShot`: stable `id`, `purpose`, `durationFrames`, `visualDirection`, `referenceRoles`, `spokenSegmentIds`, `copyCueIds`, `visual`, `audioCues`, `captionCues`, `overlayCues`.
- `AssetBinding`: canonical source kind + asset ID + pinned content revision/hash; optional measured source-in/out frames. Unresolved bindings contain a reason, never an invented ID or arbitrary URL.
- `CopyRevision`: exact script segments and on-screen copy cues, content hash, revision and approval record. Store within the immutable storyboard revision initially; no separate global copy service.
- `ResolvedStoryboard`: server-authorized canonical media locators, measured bounds, resolved copy/layouts and readiness findings. R2 keys are server-resolved, never trusted from client submissions.
- `StoryboardApplicationReceipt`: operation ID, storyboard revision, before/after timeline ID/revision, checkpoint version ID, after-state, source revision and shot-to-clip map.

Recommended API under `/api/agency/video/projects/:id/storyboard`:

| Method/path | Contract |
|---|---|
| GET root | Current plan, immutable revision identity, reference approvals and readiness. |
| POST `/plan` | Brief/mode/target/recipe + operation ID; create a candidate using server-authorized context, without changing current draft or timeline. |
| POST `/revisions` | Candidate/manual plan + expected current revision + operation ID; validate and atomically advance current pointer. Explicit `approveCopy` human action records copy approval with server actor/time; AI content cannot set approval fields. |
| GET `/revisions/:revision` | Read an authorized historical revision. |
| PUT `/references` | Version reference mappings/usage approvals with expected revision; no media copying. |
| POST `/resolve` | Resolve a pinned revision for requested formats; return blockers and proposed cut summary. No timeline writes or generation. |
| POST `/apply` | Operation ID, storyboard revision, expected timeline ID/revision and replacement confirmation; return receipt after atomic save. |
| GET `/applications/:operationId` | Recover committed result after timeout/refresh. |
| POST `/timeline-review` | Operation ID, expected timeline ID/revision, explicit changed-obligation mappings and approved copy revision; revalidate and approve adjusted edit without replacing clips. |

All new routes require project authorization, including reads. Reuse the existing creator/admin/owner access rule; do not invent broader staff access. Enforce asset/client scope independently of project role. Register new mutation families with the existing God-mode ledger; canonical idempotency/concurrency must also work for ordinary staff. Reads must not require write permission beyond existing policy.

Extend existing timeline GET/PUT, versions and render snapshot operations to round-trip/check `edit_revision`. All paths that can change the active timeline or pointer participate in the same project lock and precondition. Older clients without the token receive a refresh-required conflict, not an unguarded write. Autosave must serialize writes and resolve pending requests before apply/version/render actions.

R2 adds production/take/approval records referencing existing generation jobs. Cloudflare Workflows is the recommended coordinator for review waits and callbacks, not a second job or budget authority. Follow the repository's existing workflow control-plane pattern; keep FFmpeg work in the current container and use object IDs in workflow payloads. Review current official docs/SDK before implementation, including [events and approvals](https://developers.cloudflare.com/workflows/build/events-and-parameters/) and [retry rules](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/). Provider writes require their own idempotency/reconciliation boundary even inside durable steps.

## 8. Release controls, observability and rollback

- Separate default-off flags: `VIDEO_STORYBOARD_ENABLED` (R1), `VIDEO_STORYBOARD_PRODUCTION_ENABLED` (R2), `VIDEO_STORYBOARD_CONTINUITY_ENABLED` (R3). Later flags require earlier ones plus existing generation/render policies. Resolve deployed values from Cloudflare bindings with local/test fallback.
- Disabling a flag stops new storyboard planning/application or the corresponding production actions at both UI/API boundaries; saved plans, receipts and existing timelines remain readable. Keep the legacy manual editor usable. Review/correction of obligations on an already-applied edit remains available, including explicit copy/reference reapproval scoped to that edit, without starting new plans or paid work. In-flight work must reconcile without launching new paid steps after disablement.
- Content-free telemetry: plan/request/shot/job IDs, stage, latency, blocker code, cost amount/status, apply conflict and recovery outcome. Do not log scripts, customer briefs, signed URLs or secrets.
- Source → local tests → isolated DB → build/CI → hosted preview → provider receipt → rendered output → pilot acceptance are separate evidence gates. No green unit test substitutes for hosted or visual acceptance.
- Before release, fetch main, reconcile the candidate, run `pnpm deploy:check`, and use guarded repository deployment scripts. Record source SHA, main SHA, target, deployment ID, flag states and evidence links. Verify QR Codes/navigation and existing editor journeys alongside the changed surface.
- Roll back by disabling new entry points and restoring a verified compatible artifact. Keep additive records, checkpoints and revision protection. An older artifact that ignores revision tokens is not a safe concurrent-writer rollback target; prefer a roll-forward correction. Do not drop new tables as operational rollback.
- Update feature index/detail, MarketingNav where relevant, and other feature references with only the capabilities actually released. Unreleased generation/continuity must not appear as shipped features.

## 9. Acceptance matrix

| ID | Release | Required evidence |
|---|---|---|
| A1 | R1 | Empty project → six-shot 30-second dealer storyboard → selected media → saved editable timeline; exact frame total. |
| A2 | R1 | Product reveal and brand-story recipes; same asset can occupy two distinct shots. |
| A3 | R1 | Approved script/copy survives AI revision byte-for-byte; missing price cannot be invented; deliberate human change creates new revision. |
| A4 | R1 | Wrong-client, revoked, stale, missing and unknown-approval assets block applicable operations server-side; badges alone cannot approve. |
| A5 | R1 | One apply creates visual, selected voice/music, timed captions and overlays as specified; unresolved required item prevents any partial write. |
| A6 | R1 | Two-tab stale edit/apply, duplicate operation, timeout recovery, undo/redo and refresh restore lose no prior work and never duplicate clips. Trim/reorder/replace → adjusted-edit review → render preserves manual work. |
| A7 | R1 | Export portrait/square/landscape fixtures; compare preview with server output and inspect all required copy for clipping, fonts, placement and timing. Deleting/muting/hiding cues or stripping metadata cannot bypass required-copy checks, including after version restore or flag disablement. |
| A8 | R1 | Keyboard/narrow/dark-mode journey, original audio-only projects, old AV projects, manual generation and render/review navigation still work. |
| A9 | R2 | Image approval is tied to exact hash; edit invalidates approval; rejected/late takes remain inspectable and never auto-selected. |
| A10 | R2 | Concurrent budget reservation, uncertain submission, charged failure, duplicate callback, restart and disablement preserve spend limits and reconcile safely. |
| A11 | R3 | Continue/cut/new-scene fixtures; source frame provenance and upstream invalidation verified; product consistency reviewed by a human. |
| A12 | R3 | Measured speech fits approved timing, explicit silence works, licensed audio selection is recorded and captions use reviewed/aligned timing. |
| A13 | R1 | Recipe defaults/controls validate and reach the plan; existing consumers still work. Example prefill makes no AI/production/save call, cannot approve sample copy, rejects inaccessible references and identifies stale recipe evidence. |
| A14 | R2 | Protected run record captures available resolved inputs/revisions/seed and unknowns. Missing/mislabelled/oversized output blocks readiness; duplicate finalization creates one canonical asset. Queue/provider/storage stages never report premature completion; recovery does not regenerate. |
| A15 | R2 | Source/take comparison handles unequal durations and audio, and eligible handoff preserves lineage without submission or timeline replacement. Full-clip recipe evaluations record semantic failures separately from job success; new/replaced evidence begins unreviewed. |

## 10. Prior-art decisions

Adopt concepts from OneMinute-Film's [shot schemas](https://github.com/shahriarsajeeb/OneMinute-Film/blob/7fbf100f7816a2e7d4b13d34c1aa09d0832651ef/lib/director/schemas.ts), [reference management](https://github.com/shahriarsajeeb/OneMinute-Film/blob/7fbf100f7816a2e7d4b13d34c1aa09d0832651ef/lib/characters/service.ts), [production review](https://github.com/shahriarsajeeb/OneMinute-Film/blob/7fbf100f7816a2e7d4b13d34c1aa09d0832651ef/lib/production/studio-production.ts) and [exact text composition](https://github.com/shahriarsajeeb/OneMinute-Film/blob/7fbf100f7816a2e7d4b13d34c1aa09d0832651ef/lib/visual/exact-text.ts). Its local filesystem/process runtime and provider choices are not the implementation template. Approval hashes and reference frames establish provenance; they do not establish generated visual correctness.

Recommended sequencing is fixed for this plan. Model selection, current migration numbers and isolated preview resources must be resolved from current source/environment when the owning task starts. Lack of a supported provider blocks only that production capability, not the R1 storyboard release.

Freefield adoption is limited to P9/A13–A15 and refinements of existing tasks. Matting, upscaling, generative reframing, reference-sheet/style and camera-transfer investigations remain the separate FF-RD01–FF-RD05 backlog in the research report, with independent capability/terms/cost decisions. They do not block R1 or automatically enter any release.
