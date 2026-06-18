# Cloudflare AI Video Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing AV editor so AI-generated video clips are created through Cloudflare AI Gateway models, stored as first-class `video_assets`, and inserted into the timeline.

**Architecture:** Keep Cloudflare AI Gateway as the only real provider. Treat Open Generative AI as UX/workflow reference material only. Build vertically: harden the Cloudflare model/provider layer first, then improve generation UX, then add editor actions such as regenerate, extend, and add-to-timeline.

**Decision record:** `docs/decisions/ADR-001-cloudflare-ai-video-generation.md`

**Tech Stack:** Nuxt 4, Vue, TypeScript, Vitest, Cloudflare Pages, Cloudflare Workers AI binding, Cloudflare Queues, R2, PostgreSQL.

---

## Scope

In scope:
- Cloudflare AI Gateway image-to-video model readiness.
- Generated clip lifecycle: job -> provider -> R2 -> `video_assets` -> editor library/timeline.
- UX patterns borrowed from Open Generative AI: generation history, regenerate, prompt templates, source picker, pending state recovery.

Out of scope:
- MuAPI integration.
- Client-side provider API keys.
- Forking Open Generative AI.
- Local desktop inference.
- Full new timeline engine.

## File Map

- `server/utils/video-generation/modelRegistry.ts`: Cloudflare model availability, model metadata, tenant-facing flags.
- `server/utils/video-generation/cfInputs.ts`: Cloudflare partner model input mapping.
- `server/utils/video-generation/providers/aiGatewayProvider.ts`: `env.AI.run` submit/poll behavior and output normalization.
- `server/utils/video-generation/providers/muapiProvider.ts`: keep dormant or remove from exposed wiring in a later cleanup.
- `workers/video-generation/src/index.ts`: queue consumer provider registration.
- `app/components/media/MediaGeneratePicker.vue`: generation composer UX.
- `app/composables/useVideoGenerationJobs.ts`: active job polling and UI state.
- `app/composables/useMediaProjectEditor.ts`: generated asset insertion path.
- `app/utils/videoGenerationForm.ts`: validation and mode/model filtering.
- `app/utils/video/generationTemplates.ts`: prompt templates.
- `server/api/agency/video/generation/jobs*.ts`: generation job creation/list/read access control.
- `server/api/agency/video/generation/source-assets*.ts`: project-scoped source asset registration.
- `server/utils/video-generation/sourceAssets.ts`: source metadata loading and pre-reservation tenant validation.
- `test/video-generation/*.test.ts`: provider, model registry, Cloudflare input mapping, worker behavior.
- `test/app/videoGenerationForm.test.ts`: UI form behavior.

## Phase 1: Cloudflare I2V Reliability

### Task 1: Remove MuAPI From Active Planning Surface

**Files:**
- Modify: `server/utils/video-generation/modelRegistry.ts`
- Modify: `test/video-generation/modelRegistry.test.ts`
- Modify: `test/app/videoGenerationForm.test.ts`

**Acceptance criteria:**
- No `muapi/*` model is returned from `listSelectableVideoGenerationModels()`.
- Tests no longer depend on MuAPI model cost examples.
- Cloudflare `aigateway/*` models remain selectable according to `defaultEnabled`.
- Generation submission accepts only active selectable Cloudflare AI Gateway tenant models.
- Generation submission rejects model-incompatible mode, duration, aspect ratio, resolution, explicit subject type, and missing-source requests before compliance or budget work.

**Steps:**
- [x] Update tests to assert selectable models are Cloudflare-only.
- [x] Keep dormant MuAPI entries only if historical tests or migrations still need lookup compatibility.
- [x] Reject hidden/internal/mock/legacy provider models at the submit API boundary.
- [x] Add server-side request-shape validation against selected model metadata.
- [x] Run `pnpm test:run test/video-generation/modelRegistry.test.ts test/app/videoGenerationForm.test.ts`.

### Task 2: Verify Cloudflare Input Mapping Against Current Models

**Files:**
- Modify: `server/utils/video-generation/cfInputs.ts`
- Modify: `test/video-generation/cfInputs.test.ts`

**Acceptance criteria:**
- Seedance, Wan, and Hailuo I2V payloads match the current Cloudflare schema expectations.
- Base64-only behavior remains limited to models that require it.
- Unsupported aspect/resolution/duration values are coerced predictably.

**Steps:**
- [x] Add or update tests for `bytedance/seedance-2.0-fast`.
- [x] Add or update tests for `alibaba/wan-2.7-i2v`.
- [x] Add or update tests for `minimax/hailuo-2.3-fast`.
- [x] Run `pnpm test:run test/video-generation/cfInputs.test.ts`.

### Task 3: Harden AI Gateway Provider Output Handling

**Files:**
- Modify: `server/utils/video-generation/providers/aiGatewayProvider.ts`
- Modify: `test/video-generation/aiGatewayProvider.test.ts`

**Acceptance criteria:**
- Provider extracts output URLs from all known Cloudflare response shapes.
- Failed/empty provider responses become safe failure messages.
- Gateway metadata includes tenant, project, user, job, and model ids.

**Steps:**
- [x] Add failing tests for alternate successful response shapes.
- [x] Add failing test for empty/invalid result response.
- [x] Implement minimal output extraction improvements.
- [x] Run `pnpm test:run test/video-generation/aiGatewayProvider.test.ts`.

## Phase 2: Generated Clip UX

### Task 4: Improve Generation Job Status In Editor

**Files:**
- Modify: `app/composables/useVideoGenerationJobs.ts`
- Modify: `app/components/media/MediaGenerationStatus.vue`
- Add/modify tests if existing component tests cover the state.

**Acceptance criteria:**
- Queued/running jobs survive page refresh visually.
- Failed jobs show safe, user-readable errors.
- Succeeded jobs expose output asset id where available.

**Steps:**
- [x] Review current status component behavior.
- [x] Extend job view metadata so output/source fields are available to editor UI.
- [x] Keep active-job status surfaced through the existing `MediaGenerationStatus` card.

### Task 5: Add Generation History Rail

**Files:**
- Modify: `app/components/media/MediaGeneratePicker.vue`
- Modify: `app/composables/useVideoGenerationJobs.ts`

**Acceptance criteria:**
- Recent project generation jobs are visible near the composer.
- Users can identify model, status, prompt, and created time.
- Succeeded jobs can be sent to the library/timeline action path.

**Steps:**
- [x] Reuse `/api/agency/video/generation/jobs`.
- [x] Show active and completed jobs, newest first.
- [x] Surface model, prompt, and status near the composer.

### Task 6: Add Regenerate From Prior Job

**Files:**
- Modify: `app/components/media/MediaGeneratePicker.vue`
- Modify: `app/utils/videoGenerationForm.ts`
- Modify: `test/app/videoGenerationForm.test.ts`

**Acceptance criteria:**
- A prior job can prefill prompt, mode, model, duration, and aspect.
- Regenerate creates a new idempotency key.
- Source image requirements are still enforced for I2V.

**Steps:**
- [x] Add form helper test for cloning prior job settings.
- [x] Implement helper.
- [x] Wire action in the generation history rail.

## Phase 3: Editor Actions

### Task 7: Add Generated Asset To Timeline

**Files:**
- Modify: `app/composables/useMediaProjectEditor.ts`
- Modify: relevant media library component that lists `video_assets`.
- Modify/add tests around video library timeline behavior.

**Acceptance criteria:**
- A generated `video_asset` can be added to the first video track.
- If no video track exists, one is created.
- Placement uses existing non-overlap logic.

**Steps:**
- [x] Reuse `addVideoClipAction`.
- [x] Ensure generated asset stream source is merged before insertion.
- [x] Run relevant video timeline tests.

### Task 8: Add Prompt Templates For Agency Video Workflows

**Files:**
- Modify: `app/utils/video/generationTemplates.ts`
- Modify: `test/app/videoGenerationForm.test.ts` if template helper behavior changes.

**Acceptance criteria:**
- Templates cover vehicle hero motion, product reveal, b-roll, offer background, and showroom walkaround.
- Templates do not imply unsupported model features.
- Vehicle templates default to image-to-video.

**Steps:**
- [x] Add templates as plain data.
- [x] Verify prompt text is practical and safe for current model policy.

## Phase 4: Future Capabilities Behind Flags

### Task 9: Model-Capability Flags For Extension, End Frame, And V2V

**Files:**
- Modify: `server/utils/video-generation/types.ts`
- Modify: `server/utils/video-generation/modelRegistry.ts`
- Modify: `app/components/media/MediaGeneratePicker.vue`

**Acceptance criteria:**
- Capability metadata exists so future UI can hide unsupported advanced edit actions.
- No unsupported action can be submitted to the server.
- Existing I2V behavior remains unchanged.

**Steps:**
- [x] Add optional capability metadata to model type.
- [x] Default every current model to conservative capabilities.
- [x] Keep future controls unrendered until a model declares support.

## Phase 5: Project-Scoped Security Hardening

### Task 10: Guard Generation Jobs By Project Access

**Files:**
- Modify: `server/api/agency/video/generation/jobs.post.ts`
- Modify: `server/api/agency/video/generation/jobs.get.ts`
- Modify: `server/api/agency/video/generation/jobs/[id].get.ts`
- Modify: `test/video-generation/generationApi.test.ts`
- Add: `test/video-generation/jobsListApi.test.ts`

**Acceptance criteria:**
- Job creation, project job history, and single-job reads verify the caller can use the AV project.
- Non-admin/non-owner users cannot create, list, or read jobs from another user's project.
- Non-AV projects are rejected on generation job read/list surfaces.

**Steps:**
- [x] Add shared project access helper.
- [x] Apply it to job create/list/read endpoints.
- [x] Add regressions for editor, owner, cross-user, disabled, invalid id, and non-AV cases.

### Task 11: Project-Scope Source Asset Registration

**Files:**
- Modify: `app/components/media/MediaGeneratePicker.vue`
- Modify: `server/api/agency/video/generation/source-assets.post.ts`
- Modify: `server/api/agency/video/generation/source-assets/from-asset.post.ts`
- Add: `server/api/agency/video/generation/source-assets/from-timeline-still.post.ts`
- Add: `server/utils/video-generation/sourceContentTypes.ts`
- Add: `server/utils/video-generation/timelineStillSource.ts`
- Add: `test/video-generation/sourceAssetsUpload.test.ts`
- Add: `test/video-generation/sourceFromTimelineStill.test.ts`
- Add: `test/video-generation/sourceContentTypes.test.ts`
- Add: `test/video-generation/timelineStillSource.test.ts`

**Acceptance criteria:**
- Direct source uploads are tied to a verified AV project and derive client ownership from that project.
- Timeline still source registration saves the draft first, then verifies project ownership and current timeline clip existence server-side.
- Existing video asset source registration rejects non-image R2 keys.

**Steps:**
- [x] Send `projectId` from the picker for source uploads.
- [x] Derive source `clientId` from the verified project instead of multipart input.
- [x] Add timeline-still source registration endpoint and tests.
- [x] Reject unsupported source content types before creating source assets.

### Task 12: Fail Closed Before Budget Reservation

**Files:**
- Modify: `server/api/agency/video/generation/jobs.post.ts`
- Modify: `server/utils/video-generation/sourceAssets.ts`
- Add: `test/video-generation/sourceAssets.test.ts`
- Modify: `test/video-generation/generationApi.test.ts`

**Acceptance criteria:**
- Cross-tenant, missing, or unapproved I2V source assets are rejected before policy loading, budget reservation, job creation, or queue enqueue.
- Valid tenant-owned and agency-owned source assets continue to work.
- Tenant idempotency keys can only reuse jobs for the same project; same-tenant cross-project key reuse returns a conflict.

**Steps:**
- [x] Add tenant-aware source asset loading.
- [x] Validate I2V sources before budget reservation.
- [x] Reject cross-project idempotency reuse before returning existing jobs or reserving budget.
- [x] Add endpoint and helper regressions.

### Task 13: Quarantine Legacy MuAPI Webhook Surface

**Files:**
- Modify: `server/api/agency/video/generation/webhook.post.ts`
- Add: `test/video-generation/webhookEndpoint.test.ts`

**Acceptance criteria:**
- The legacy webhook only queries legacy MuAPI jobs.
- It ignores non-MuAPI rows defensively.
- Unsigned calls fail before any database mutation.

**Steps:**
- [x] Add `provider = 'muapi'` query guard.
- [x] Add defensive wrong-provider ignore.
- [x] Add endpoint-level webhook regressions.

## Verification Commands

- `pnpm test:run test/video-generation/cfInputs.test.ts test/video-generation/aiGatewayProvider.test.ts test/video-generation/modelRegistry.test.ts test/video-generation/modelsApi.test.ts test/video-generation/surface.test.ts test/app/videoGenerationForm.test.ts test/video-generation/muapiProvider.test.ts test/video/generationStatusVisibility.test.ts test/video/videoLibraryTimeline.test.ts test/audio/timelineEditAv.test.ts test/video/generationTemplates.test.ts test/video/modelPresentation.test.ts test/video-generation/sourceFromTimelineStill.test.ts test/video-generation/sourceFromAsset.test.ts test/video-generation/sourceAssetsUpload.test.ts test/video-generation/sourceAssets.test.ts test/video-generation/sourceAssetStore.test.ts test/video-generation/resolveSourceUrls.test.ts test/audio/mediaEditorAv.test.ts test/video-generation/sourceContentTypes.test.ts test/video-generation/timelineStillSource.test.ts test/video-generation/generationApi.test.ts test/video-generation/budget.test.ts test/video-generation/jobsListApi.test.ts test/video-generation/worker.test.ts test/video-generation/reconcile.test.ts test/video-generation/jobsList.test.ts test/video-generation/webhook.test.ts test/video-generation/webhookEndpoint.test.ts`
- `pnpm exec vue-tsc --noEmit --pretty false --skipLibCheck`

## Recommended Starting Point

Start with Tasks 1-3. That creates a clean Cloudflare-only foundation before adding UI. Do not begin V2V, lip-sync, or extension UX until a Cloudflare model capability is verified and represented in the model registry.
