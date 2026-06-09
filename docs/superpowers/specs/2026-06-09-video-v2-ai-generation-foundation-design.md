# Video V2 — AI Generation Foundation design

**Status:** Approved design — 2026-06-09
**Slice:** V2.1 of the Video Studio roadmap — generation foundation plus one dormant provider adapter.
**Builds on:** Video V1.1→V1.4: AV timeline schema, composite render queue, render distribution, portal review, and reusable video assets.
**Reference inputs:** `docs/engagr-ai-media-studio-video-brief.md`, `docs/engagr-ai-media-studio-video-v1-roadmap.md`, Open Generative AI, and ViMax.

---

## 1. Goal & scope

Add the durable server-side foundation for AI-assisted video generation without exposing unmanaged live generation to users.

**In scope:**
- A typed video model registry for text-to-video, image-to-video, video-extension, and lip-sync capable models.
- A compliance gate that blocks unsafe vehicle generation before a job can be queued.
- Cost estimation and tenant cap checks before enqueue.
- A `video_generation_jobs` persistence model with idempotency, provenance, provider state, and output asset linkage.
- A dedicated `video-generation` queue producer/consumer path.
- One real provider adapter shape, kept dormant behind feature flags, credentials, model allowlists, and tenant cap checks.
- Tests for registry, compliance, cost decisions, API gating, enqueue behavior, and worker idempotency.

**Out of scope for this slice:**
- A broad user-facing model picker.
- Public/default enablement of generation.
- Text-to-video for vehicles.
- Replacing the V1 render path. Generated clips become media assets; V1 render still assembles the final output.
- Long-form agentic story planning UI. The data shape should allow it later, but the first slice is infrastructure.

---

## 2. Product stance

Video generation is expensive and compliance-sensitive. The platform must treat it as an auditable, costed, asynchronous action, not as a casual preview button.

The default automotive path is:

1. Use approved real vehicle imagery from inventory, OEM, dealer upload, or agency-managed assets.
2. Generate image-to-video motion only from those approved pixels.
3. Store prompt, model, inputs, user, tenant, cost estimate, and output provenance.
4. Send generated output through the existing AV timeline and review/export workflow.

Text-to-video is allowed only for non-vehicle b-roll, lifestyle backgrounds, environments, abstract brand motion, or similar content where the model cannot misrepresent a real vehicle.

---

## 3. Architecture

Create a new server boundary:

```text
server/utils/video-generation/
  modelRegistry.ts      # model metadata and capability lookup
  compliance.ts         # pre-enqueue policy gate
  costs.ts              # cost estimation and cap decision helpers
  jobs.ts               # persistence mapper/helpers around video_generation_jobs
  enqueue.ts            # VIDEO_GENERATION_QUEUE producer boundary
  providers/
    types.ts            # provider contract
    mockProvider.ts     # deterministic tests/local adapter
    gatewayProvider.ts  # dormant real submit/poll adapter, exact endpoint verified at implementation
```

The V1 render code remains in `server/utils/audio/` and `workers/audio-jobs/`. Generation is a separate upstream step:

```text
user request
  -> API validates auth/project/flag
  -> registry validates model and capability
  -> compliance gate evaluates mode/prompt/assets
  -> cost estimator checks tenant cap
  -> video_generation_jobs row is created
  -> VIDEO_GENERATION_QUEUE message is enqueued
  -> worker calls provider
  -> result is copied to R2 and registered as a reusable video asset
  -> generated asset can be inserted into the AV timeline
  -> existing video-render queue renders final ad
```

---

## 4. Flags and gates

Generation is inaccessible unless every gate passes:

- `VIDEO_GENERATION_ENABLED=true`
- `VIDEO_STUDIO_ENABLED=true`
- provider credentials are present
- selected model is globally available
- selected model is allowed for the tenant
- tenant has remaining generation budget
- compliance gate returns `allowed`
- request supplies an idempotency key

When the feature flag is off, generation endpoints return 404, matching the Video Studio render endpoints.

---

## 5. Model registry

The registry is a typed source of truth, inspired by Open Generative AI's model catalog pattern, but with ADME-specific governance fields.

Each model definition includes:

- `id`
- `provider`
- `displayName`
- `modes`: `text-to-video`, `image-to-video`, `video-extension`, `lip-sync`
- `allowedSubjectTypes`: `vehicle`, `non_vehicle`, or both
- `requiresApprovedSourceAsset`
- `supportsNativeAudio`
- `durationsSeconds`
- `aspectRatios`
- `resolutions`
- `estimatedCostCents`
- `costUnit`: `generation`, `second`, or `clip`
- `safetyClass`: `vehicle_i2v_safe`, `non_vehicle_t2v`, `experimental`, or `disabled`
- `defaultEnabled`

The first implementation can seed a small registry:

- one disabled/dormant image-to-video provider entry for approved vehicle assets
- one disabled/dormant text-to-video provider entry for non-vehicle b-roll
- one mock provider entry for tests

This keeps the production behavior inert while locking the contract.

---

## 6. Compliance gate

The compliance gate is a pure function so it can be tested heavily and reused by API and worker code.

Input:

- `mode`
- `prompt`
- `model`
- `sourceAssets`
- `requestedSubjectType`: `vehicle`, `non_vehicle`, or `unknown`
- `tenantPolicy`

Rules:

1. Block text-to-video when the subject is `vehicle`.
2. Block text-to-video when the prompt includes high-confidence vehicle intent such as stock, dealer inventory, OEM model, trim, badge, grille, demonstrator, rego, VIN, or vehicle features.
3. Block image-to-video for vehicle subjects unless at least one source asset is marked approved.
4. Block any model not allowed by tenant policy.
5. Block models marked `disabled` unless the caller is in explicit internal test mode.
6. Require provenance fields: prompt, model, mode, user, tenant, project, idempotency key, and source asset IDs for image-conditioned generation.

The gate returns structured data:

```ts
type VideoGenerationComplianceResult =
  | { allowed: true; classification: 'vehicle_i2v' | 'non_vehicle_t2v' | 'other_safe'; reasons: string[] }
  | { allowed: false; classification: 'blocked_vehicle_t2v' | 'missing_approved_asset' | 'model_not_allowed' | 'missing_provenance' | 'disabled_model'; reasons: string[] }
```

---

## 7. Cost and tenant caps

Cost checks run before enqueue.

The first slice should implement a deterministic estimator from registry metadata:

```text
estimated = model.estimatedCostCents
if costUnit == second: estimated *= durationSeconds
if costUnit == clip/generation: estimated *= 1
```

Tenant caps use an interface rather than a full billing product:

- `loadTenantVideoGenerationPolicy(tenantId)`
- `getTenantVideoGenerationSpendCents(tenantId, period)`
- `canSpendVideoGenerationCents(policy, currentSpend, estimate)`

If no tenant policy exists, default to `disabled`. Super-admin enablement can be built later without changing the generation contract.

---

## 8. Data model

Add migration `video_generation_jobs`.

Columns:

- `id uuid primary key`
- `tenant_id text not null`
- `project_id uuid not null`
- `timeline_id uuid null`
- `created_by text not null`
- `status text not null`
- `mode text not null`
- `model_id text not null`
- `provider text not null`
- `prompt text not null`
- `source_asset_ids jsonb not null default '[]'`
- `duration_seconds integer not null`
- `aspect_ratio text not null`
- `resolution text null`
- `subject_type text not null`
- `compliance_status text not null`
- `compliance_reasons jsonb not null default '[]'`
- `estimated_cost_cents integer not null`
- `actual_cost_cents integer null`
- `idempotency_key text not null`
- `provider_request_id text null`
- `provider_status text null`
- `provider_result_url text null`
- `output_asset_id uuid null`
- `output_r2_key text null`
- `error_message text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `started_at timestamptz null`
- `completed_at timestamptz null`

Constraints:

- unique `(tenant_id, idempotency_key)`
- check `status in ('queued','running','succeeded','failed','blocked')`
- check `mode in ('text-to-video','image-to-video','video-extension','lip-sync')`
- check `subject_type in ('vehicle','non_vehicle','unknown')`

The job row is the provenance record. It should never be hard-deleted by normal user actions.

---

## 9. API and worker

### API

Add `POST /api/agency/video/generation/jobs`.

Behavior:

1. Return 404 unless `VIDEO_STUDIO_ENABLED` and `VIDEO_GENERATION_ENABLED` are both true.
2. Require agency auth.
3. Validate request body with Zod.
4. Resolve project and tenant scope.
5. Look up model.
6. Load source asset metadata.
7. Run compliance.
8. If blocked, create a `blocked` job row and return 422 with reasons; do not enqueue.
9. Estimate cost and enforce cap.
10. Create or reuse job by `(tenant_id, idempotency_key)`.
11. Enqueue `{ jobId, tenantId, idempotencyKey }`.
12. Return 202 with the job.

Add `GET /api/agency/video/generation/jobs/[id]` for polling job status.

### Worker

Add `workers/video-generation/` as a standalone Worker rather than overloading `audio-jobs`.

Reasons:

- video generation provider calls are long-running and cost-bearing
- retry/idempotency policy is different from render
- keeping generation separate makes kill-switch and logs clearer

The worker consumes `video-generation`, loads the job, checks idempotency/status, marks running, calls the provider adapter, stores the result in R2, creates or links a video asset, then marks succeeded. On provider failure it marks failed with a safe error message.

---

## 10. Provider adapter

Provider contract:

```ts
interface VideoGenerationProvider {
  submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission>
  poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult>
}
```

The first real adapter is dormant and should be selected during implementation based on verified provider docs and credentials:

- Cloudflare AI Gateway proxied video model, if the submit/poll contract is available and compatible.
- Muapi-style submit/poll adapter, if that is the fastest reliable path to prove model generation later.

The implementation must not expose a provider as enabled unless a focused live verification has been completed and documented.

---

## 11. UI

No broad UI in this slice.

Optional internal-only surface:

- hidden behind `VIDEO_GENERATION_ENABLED`
- available only in the AV editor
- generates a clip asset, not a final video
- displays estimated cost before submit
- displays compliance block reasons

If time is tight, skip UI and keep the first slice API/worker/test-only.

---

## 12. Testing

TDD coverage:

- `test/video-generation/modelRegistry.test.ts`
  - registry rejects unknown models
  - registry exposes capability metadata
  - disabled models are not selectable for normal generation
- `test/video-generation/compliance.test.ts`
  - blocks vehicle text-to-video
  - blocks vehicle-like prompts even when subject is unknown
  - allows image-to-video with approved source asset
  - blocks image-to-video without approved source asset for vehicles
- `test/video-generation/costs.test.ts`
  - estimates per-generation and per-second models
  - rejects over-cap tenants
  - defaults missing tenant policy to disabled
- `test/video-generation/generationApi.test.ts`
  - returns 404 when flags are off
  - returns 422 and does not enqueue for blocked requests
  - creates queued job and enqueues for allowed requests
  - reuses idempotent job on duplicate idempotency key
- `test/video-generation/providerAdapter.test.ts`
  - maps submit/poll responses into the provider contract
- `test/video-generation/worker.test.ts`
  - skips already-running/succeeded jobs
  - marks provider failures as failed without duplicate billing
  - stores successful output as a video asset

No live provider calls in unit tests.

---

## 13. Risks

1. **Provider contract drift** — model APIs change quickly. Mitigate by isolating the provider adapter and keeping the model registry explicit.
2. **Cost leakage** — retries can double-bill. Mitigate with `(tenant_id, idempotency_key)` uniqueness and worker status checks before provider calls.
3. **Compliance bypass** — generation must not be reachable through a weaker endpoint. Mitigate by keeping compliance in a shared server utility and testing API blocked/no-enqueue behavior.
4. **Tenant policy ambiguity** — if no policy exists, default disabled.
5. **Scope creep into agentic generation** — ViMax-style scene planning is valuable, but it belongs after the job/provenance/cost spine is working.

---

## 14. Success criteria

- Developers can add a video model to the registry with explicit capabilities and governance metadata.
- Unsafe vehicle text-to-video requests are blocked before enqueue with structured reasons.
- Approved-asset image-to-video requests can create a queued generation job when flags, tenant policy, model allowlist, and cost caps pass.
- Duplicate requests with the same idempotency key do not create duplicate provider calls.
- The provider adapter boundary is present and testable, but no live generation is exposed by default.
- Generated outputs are represented as reusable video assets that flow into the existing AV timeline/render/distribution path.
