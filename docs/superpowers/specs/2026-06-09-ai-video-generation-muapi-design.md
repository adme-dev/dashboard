# AI Video Generation (muapi) — Slice 1 Design

**Date:** 2026-06-09
**Status:** Approved for planning
**Owner:** Paul
**Branch:** `feat/ai-video-generation-muapi`

## Summary

Turn the existing **dormant** Video Studio V2 generation scaffold into a working,
provider-backed **AI generation studio** inside the AV timeline editor. Slice 1
ships **image-to-video** and **text-to-video** via **muapi.ai** as the real
provider (replacing the mock), with generated clips surfacing in the editor's
Video Library and addable to the timeline. All existing guardrails (compliance,
budget cap, idempotency) are kept. Ships **dormant behind flags** — no auto-enable.

This is additive: the provider boundary, jobs table, queue/worker, cost,
compliance, and idempotency already exist. Slice 1 fills the missing pieces:
a real provider adapter, real model registry entries, async completion handling,
output-bytes persistence, and the editor UI.

References that shaped the direction: muapi.ai (unified gen-AI gateway),
Anil-matcha/Open-Generative-AI (HeyGen-alternative studio built on muapi),
HKUDS/ViMax (agentic idea→film — explicitly out of scope), HeyGen (the bar).

## Scope

**In (Slice 1):**
- Modes: `image-to-video`, `text-to-video`.
- Provider: muapi.ai, behind the existing swappable provider adapter.
- 1 real i2v model + 1 real t2v model seeded in the registry (mocks retained for tests).
- Async completion via **webhook + reconcile cron** (see Decisions).
- In-editor "Generate (AI)" slideover; finished clips land in the Video Library
  with a one-click "Add to timeline" (best-effort auto-add if the slideover is
  still open on completion).
- All existing guardrails kept (compliance, monthly budget cap, idempotency).
- **No migration** (existing tables cover it).

**Out (later slices):**
- `lip-sync`, `video-extension`.
- Dedicated standalone "AI Studio" page.
- Multi-model variation fan-out.
- Agentic idea→film (ViMax-style) orchestration.

## Decisions (resolved open questions)

1. **Async completion: webhook + reconcile (chosen)** over inline long-poll in
   the worker. muapi supports webhooks; the codebase already has signed-webhook
   patterns (leads, Meta). Inline multi-minute polling risks CF Worker duration
   limits and double-billing on queue retry. The worker submits and persists
   `providerRequestId` only; completion is driven by the webhook, with a
   reconcile cron as a safety net for missed callbacks.
2. **i2v source still: both** — pick an existing still already on the timeline,
   or upload a new one via the existing `upload-media` path.

## Architecture & Data Flow

```
Editor "Generate (AI)" slideover
  → POST /api/agency/video/generation/jobs          (EXISTS: gated, compliance, cost, idempotency)
      → video_generation_jobs row (status=queued)
      → VIDEO_GENERATION_QUEUE.send({ jobId })
  → workers/video-generation consumer
      → provider.submit()  (muapi POST → request_id)  (NEW adapter; mock retained)
      → persist providerRequestId, status=running, ack  (no inline long-poll for muapi)
  → muapi → POST /api/agency/video/generation/webhook  (NEW, signed)
      → finalizeVideoGenerationJob():
          fetch(outputUrl) → R2.put(r2Key) → video_assets row → status=succeeded
  → reconcile cron branch (safety net)                 (NEW, via pages-cron)
      → for jobs running past threshold: provider.poll() → finalize/fail

Editor Video Library (polls generation-jobs list)
  → on succeeded: shows clip; "Add to timeline" → addVideoClipAction(asset.r2_key, ...)
```

**Worker structural change (the one change to existing code):** today
`processVideoGenerationJob` does submit→poll→finalize in one pass (correct for the
mock, which returns `succeeded` immediately). Extract a shared
**`finalizeVideoGenerationJob(result, deps)`** so:
- mock provider (synchronous `succeeded`) finalizes inline — existing worker tests stay green;
- muapi (`running`) leaves the job running; **webhook or reconcile** calls the same `finalize`.

This also closes a real gap: `createOutputAsset` currently records an `r2Key` but
**nothing writes the bytes**. `finalize` performs `fetch(outputUrl) → R2.put(r2Key)`.
Finalize runs in **Pages** (webhook + reconcile both have R2 via `server/utils/storage.ts`),
so the worker stays submit-only and needs no R2 binding.

## Components

### New
- `server/utils/video-generation/providers/muapiProvider.ts` — implements
  `VideoGenerationProvider` (`submit`/`poll`). `submit()`: POST
  `https://api.muapi.ai/api/v1/<endpoint>` with `x-api-key`, body
  `{ prompt, image_url?, duration, aspect_ratio, resolution, webhook }` →
  `{ providerRequestId: request_id, status }`. `poll()`: GET
  `…/predictions/{request_id}/result` → `{ status, outputUrl, actualCostCents }`.
  Injected `fetch` + config (key, base URL, webhook URL) for unit tests.
- `server/utils/video-generation/finalize.ts` — `finalizeVideoGenerationJob`
  (download output → R2 → `video_assets` → mark succeeded). Pure-ish, injected R2/db.
- `server/api/agency/video/generation/webhook.post.ts` — verifies HMAC/shared-secret
  signature (Meta/leads pattern), looks up job by `providerRequestId`, calls
  `finalize`. Idempotent (no-op if already terminal).
- `server/api/agency/video/generation/jobs.get.ts` — `?projectId=` list for the
  Library/poller. (`jobs/[id].get.ts` already exists for single-job polling.)
- `server/api/cron/video-generation-reconcile.post.ts` — reconcile branch
  (running-past-threshold → `provider.poll()` → finalize/fail), gated by flags,
  wired into `workers/pages-cron`.
- `app/components/media/MediaGeneratePicker.vue` — the Generate slideover.
- `app/utils/videoGenerationForm.ts` — pure form logic (mode→model filtering,
  validation, cost preview) for unit tests.
- `app/composables/useVideoGenerationJobs.ts` — jobs poller (mirrors the
  render-jobs poller / `nextPollDelay`).

### Extended
- `server/utils/video-generation/modelRegistry.ts` — add 1 real i2v + 1 real t2v
  muapi model (`provider: 'muapi'`, correct `safetyClass`/`allowedSubjectTypes`,
  durations/aspects/resolutions, `estimatedCostCents`, muapi `endpoint` + param map).
  Keep mocks; keep `gateway/*` dormant.
- `workers/video-generation/src/index.ts` + `worker.ts` — select `muapiProvider`
  when `job.provider==='muapi'`, else mock; submit-then-ack for async providers;
  reuse shared `finalize` for synchronous providers.
- `app/pages/agency/audio/projects/[id].vue` — add "Generate (AI)" to the Add
  dropdown (shown when `isAv && videoGenerationEnabled`); wire the slideover +
  jobs poller; add "Add to timeline" from the Library.
- `app/components/media/MediaVideoLibrary.vue` — surface generation jobs/assets
  with status + an "Add to timeline" action.
- `nuxt.config.ts` — expose `videoGenerationEnabled` public runtime flag.

## UI

"Generate (AI)" item in the editor's existing Add dropdown (next to Footage/still,
Overlay), shown only when `isAv && videoGenerationEnabled`. Slideover fields:
- **mode** (Image→video / Text→video)
- **model** (filtered by mode + tenant-allowed models)
- **prompt** (required; max 4000)
- **source still** (i2v only): pick an existing timeline still OR upload via `upload-media`
- **duration** (model-constrained), **aspect ratio** (defaults to project format)
- **subject type** (vehicle / non-vehicle / unknown) — drives compliance
- **estimated cost** line (live, from `estimateVideoGenerationCostCents`)

Submit → `POST …/jobs` → 202 → slideover shows progress (polls `jobs/[id]`).
Finished assets appear in the **Video Library**; "Add to timeline" →
`addVideoClipAction(asset.r2_key, durationSec, 'uploaded_footage', playhead)`.
Best-effort auto-add if the slideover is still open on completion.

## Guardrails, Cost, Flags (kept)

- **Compliance** (existing engine): vehicle text-to-video **blocked**; vehicle
  image-to-video **requires an approved source asset**. Slice 1 seeds real models
  with correct `safetyClass`/`allowedSubjectTypes` so these fire correctly
  (critical for car-dealership clients).
- **Budget**: estimated cost shown pre-submit; tenant `monthlyCapCents` enforced
  server-side (402 when exceeded).
- **Idempotency**: `(tenant_id, idempotency_key)` (client-generated) prevents
  double-billing on resubmits and queue retries.
- **Activation (operator — dormant until all set):** `VIDEO_STUDIO_ENABLED=true` +
  `VIDEO_GENERATION_ENABLED=true`; secrets `MUAPI_API_KEY` + `MUAPI_WEBHOOK_SECRET`;
  per-tenant policy `enabled:true` + cap + `allowedModelIds`;
  `wrangler queues create video-generation{,-dlq}` + deploy the worker.
  **No flag flip or provisioning is performed as part of this work.**

## Testing

- `muapiProvider` submit/poll request-shaping + response-parsing (injected `fetch`).
- `finalizeVideoGenerationJob` (download→R2→asset→markSucceeded) with mocked R2/db.
- Webhook endpoint: signature verify, lookup by `request_id`, idempotency, finalize.
- Registry/compliance against the **real** seeded models: vehicle-t2v blocked,
  vehicle-i2v requires approved asset, cost/cap math.
- UI: `videoGenerationForm` pure tests + jobs-poller composable.
- Mock provider retained so existing worker tests stay green.

## Data Model

**No new tables, no migration.** `video_generation_jobs` and `video_assets`
already have the needed columns (`providerRequestId`, `providerStatus`,
`providerResultUrl`, `outputAssetId`, `outputR2Key`, …).

## Risks / Notes

- muapi per-model endpoints + param names vary; the registry holds the
  endpoint/param mapping. Exact request/response field names are **verify-live**
  against muapi docs during implementation (safe — fully gated/dormant).
- Source images for i2v must be a URL muapi can fetch → presign the R2 still.
- Webhook needs a publicly reachable, signed callback URL on the deployed Pages app.
- Marketing-site sync (features pages) deferred to go-live, per project convention.
</content>
</invoke>
