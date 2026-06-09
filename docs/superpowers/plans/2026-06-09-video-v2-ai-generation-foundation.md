# Video V2 AI Generation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the tested, dormant foundation for costed/compliant AI video generation and one provider-adapter boundary without exposing generation by default.

**Architecture:** Add a new `server/utils/video-generation/` module family for model registry, compliance, costs, job mapping, and queue enqueueing. Add a dedicated `video_generation_jobs` table and a `video-generation` queue/worker path. Generated outputs become rows in the existing `video_assets` table; the V1 render path remains unchanged.

**Tech Stack:** Nuxt/Nitro server routes, Neon Postgres migrations, Cloudflare Queues/Workers, R2 via existing storage helpers, TypeScript, Zod, Vitest.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/utils/video-generation/types.ts` | Shared generation, registry, compliance, provider, and job types. |
| `server/utils/video-generation/modelRegistry.ts` | Small typed registry plus lookup/selectability helpers. |
| `server/utils/video-generation/compliance.ts` | Pure policy gate for vehicle safety, model allowlists, and provenance requirements. |
| `server/utils/video-generation/costs.ts` | Pure estimator and tenant cap decision helpers. |
| `server/utils/video-generation/jobs.ts` | DB mapper/helpers for `video_generation_jobs`. |
| `server/utils/video-generation/enqueue.ts` | `VIDEO_GENERATION_QUEUE` producer boundary. |
| `server/utils/video-generation/providers/types.ts` | Provider adapter contract. |
| `server/utils/video-generation/providers/mockProvider.ts` | Deterministic adapter for tests/local worker smoke. |
| `server/api/agency/video/generation/jobs.post.ts` | Flag-gated create/enqueue endpoint. |
| `server/api/agency/video/generation/jobs/[id].get.ts` | Flag-gated job status endpoint. |
| `server/database/migrations/175_video_generation_jobs.sql` | Additive job/provenance table. |
| `workers/video-generation/` | Dedicated queue consumer with provider boundary and idempotent job processing. |
| `wrangler.toml` | Pages producer binding for `VIDEO_GENERATION_QUEUE`. |
| `test/video-generation/*.test.ts` | TDD coverage for pure utilities, API behavior, and worker flow. |
| `test/config/renderQueueBindings.test.ts` | Extend queue binding config checks. |

---

## Task 1: Pure Registry, Compliance, And Costs

**Files:**
- Create: `server/utils/video-generation/types.ts`
- Create: `server/utils/video-generation/modelRegistry.ts`
- Create: `server/utils/video-generation/compliance.ts`
- Create: `server/utils/video-generation/costs.ts`
- Test: `test/video-generation/modelRegistry.test.ts`
- Test: `test/video-generation/compliance.test.ts`
- Test: `test/video-generation/costs.test.ts`

- [ ] **Step 1: Write failing registry tests**

```ts
import { describe, expect, it } from 'vitest'
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

describe('video generation model registry', () => {
  it('returns null for unknown models', () => {
    expect(getVideoGenerationModel('missing-model')).toBeNull()
  })

  it('keeps dormant provider models out of normal selectable models', () => {
    expect(listSelectableVideoGenerationModels().map((m) => m.id)).toEqual(['mock/i2v-safe'])
  })

  it('describes image-to-video vehicle-safe capabilities', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')
    expect(model?.modes).toContain('image-to-video')
    expect(model?.requiresApprovedSourceAsset).toBe(true)
    expect(model?.safetyClass).toBe('vehicle_i2v_safe')
  })
})
```

- [ ] **Step 2: Write failing compliance tests**

```ts
import { describe, expect, it } from 'vitest'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

const tenantPolicy = { enabled: true, allowedModelIds: ['mock/i2v-safe', 'mock/t2v-broll'] }

describe('video generation compliance', () => {
  it('blocks vehicle text-to-video', () => {
    const model = getVideoGenerationModel('mock/t2v-broll')!
    const result = evaluateVideoGenerationCompliance({
      mode: 'text-to-video',
      prompt: 'Toyota Hilux driving through the dealership',
      model,
      sourceAssets: [],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance: { userId: 'u1', tenantId: 't1', projectId: 'p1', idempotencyKey: 'k1' }
    })
    expect(result.allowed).toBe(false)
    expect(result.classification).toBe('blocked_vehicle_t2v')
  })

  it('allows approved vehicle image-to-video', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!
    const result = evaluateVideoGenerationCompliance({
      mode: 'image-to-video',
      prompt: 'subtle parallax showroom reveal',
      model,
      sourceAssets: [{ id: 'asset-1', approved: true, subjectType: 'vehicle' }],
      requestedSubjectType: 'vehicle',
      tenantPolicy,
      provenance: { userId: 'u1', tenantId: 't1', projectId: 'p1', idempotencyKey: 'k1' }
    })
    expect(result.allowed).toBe(true)
    expect(result.classification).toBe('vehicle_i2v')
  })
})
```

- [ ] **Step 3: Write failing cost tests**

```ts
import { describe, expect, it } from 'vitest'
import { canSpendVideoGenerationCents, estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

describe('video generation costs', () => {
  it('estimates per-second models', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!
    expect(estimateVideoGenerationCostCents(model, 5)).toBe(250)
  })

  it('defaults disabled tenant policy to blocked', () => {
    expect(canSpendVideoGenerationCents({ enabled: false, monthlyCapCents: 1000 }, 0, 10).allowed).toBe(false)
  })

  it('rejects over-cap generation', () => {
    expect(canSpendVideoGenerationCents({ enabled: true, monthlyCapCents: 100 }, 75, 50).allowed).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests and verify RED**

Run: `PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm exec vitest run test/video-generation/modelRegistry.test.ts test/video-generation/compliance.test.ts test/video-generation/costs.test.ts`

Expected: fail because modules do not exist.

- [ ] **Step 5: Implement the minimal pure modules**

Create the types, registry, compliance, and costs modules matching the tests. Seed only `mock/i2v-safe`, `mock/t2v-broll`, and dormant provider entries.

- [ ] **Step 6: Run tests and verify GREEN**

Run the same Vitest command. Expected: all tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add server/utils/video-generation test/video-generation
git commit -m "feat(video): add AI generation policy foundation"
```

---

## Task 2: Job Persistence And Queue Producer

**Files:**
- Create: `server/database/migrations/175_video_generation_jobs.sql`
- Create: `server/utils/video-generation/jobs.ts`
- Create: `server/utils/video-generation/enqueue.ts`
- Test: `test/video-generation/jobs.test.ts`
- Test: `test/config/renderQueueBindings.test.ts`
- Modify: `wrangler.toml`

- [ ] **Step 1: Write failing migration/mapper tests**

Test `mapVideoGenerationJobRow()` directly with a snake_case row and assert camelCase output, including JSON fields.

- [ ] **Step 2: Write failing queue binding test**

Extend `test/config/renderQueueBindings.test.ts`:

```ts
expect(queueForBinding(config, 'VIDEO_GENERATION_QUEUE')).toBe('video-generation')
```

- [ ] **Step 3: Run tests and verify RED**

Run: `PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm exec vitest run test/video-generation/jobs.test.ts test/config/renderQueueBindings.test.ts`

Expected: fail because mapper/binding do not exist.

- [ ] **Step 4: Add migration**

Create `175_video_generation_jobs.sql` with the table, checks, indexes, and unique `(tenant_id, idempotency_key)` from the design.

- [ ] **Step 5: Add job helpers and enqueue boundary**

Implement mapper, `createVideoGenerationJob()`, `getVideoGenerationJob()`, `getVideoGenerationJobByIdempotencyKey()`, `markVideoGenerationJobRunning()`, `markVideoGenerationJobSucceeded()`, `markVideoGenerationJobFailed()`, and `enqueueVideoGeneration()`.

- [ ] **Step 6: Add Pages queue producer binding**

Append to `wrangler.toml`:

```toml
[[queues.producers]]
binding = "VIDEO_GENERATION_QUEUE"
queue = "video-generation"
```

- [ ] **Step 7: Run tests and verify GREEN**

Run the same Vitest command. Expected: all tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/database/migrations/175_video_generation_jobs.sql server/utils/video-generation/jobs.ts server/utils/video-generation/enqueue.ts test/video-generation/jobs.test.ts test/config/renderQueueBindings.test.ts wrangler.toml
git commit -m "feat(video): persist and enqueue generation jobs"
```

---

## Task 3: Flag-Gated Generation API

**Files:**
- Create: `server/api/agency/video/generation/jobs.post.ts`
- Create: `server/api/agency/video/generation/jobs/[id].get.ts`
- Test: `test/video-generation/generationApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Mock auth, project lookup, source asset lookup, job helpers, and queue helper. Cover:

- flags off returns 404
- vehicle text-to-video returns 422 and does not enqueue
- allowed image-to-video creates/enqueues and returns 202
- duplicate idempotency key reuses the existing job

- [ ] **Step 2: Run tests and verify RED**

Run: `PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm exec vitest run test/video-generation/generationApi.test.ts`

Expected: fail because endpoints do not exist.

- [ ] **Step 3: Implement endpoints**

Use `requireWriteAccess(event)`, `getProjectWithCurrentTimeline(projectId)`, Zod validation, registry lookup, compliance, cost/cap helpers, job helpers, and `enqueueVideoGeneration(event, { jobId, tenantId, idempotencyKey })`.

For this slice, tenant policy is loaded through a helper that defaults to disabled unless `VIDEO_GENERATION_TEST_TENANT_ENABLED=true`; tests can mock this helper.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same Vitest command. Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/api/agency/video/generation test/video-generation/generationApi.test.ts server/utils/video-generation
git commit -m "feat(video): add gated generation job API"
```

---

## Task 4: Worker And Provider Boundary

**Files:**
- Create: `server/utils/video-generation/providers/types.ts`
- Create: `server/utils/video-generation/providers/mockProvider.ts`
- Create: `workers/video-generation/package.json`
- Create: `workers/video-generation/tsconfig.json`
- Create: `workers/video-generation/wrangler.toml`
- Create: `workers/video-generation/src/index.ts`
- Create: `workers/video-generation/src/worker.ts`
- Test: `test/video-generation/providerAdapter.test.ts`
- Test: `test/video-generation/worker.test.ts`

- [ ] **Step 1: Write failing provider and worker tests**

Provider test checks `mockProvider.submit()` and `mockProvider.poll()` map into the adapter contract.

Worker test injects fake job store, fake provider, and fake asset writer. Cover:

- skips succeeded jobs
- marks running before provider submit
- marks failed on provider error
- marks succeeded and links output asset on provider success

- [ ] **Step 2: Run tests and verify RED**

Run: `PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm exec vitest run test/video-generation/providerAdapter.test.ts test/video-generation/worker.test.ts`

Expected: fail because provider/worker modules do not exist.

- [ ] **Step 3: Implement provider contract and pure worker orchestration**

Keep the worker orchestration dependency-injected:

```ts
export async function processVideoGenerationJob(message, deps) {
  const job = await deps.getJob(message.jobId)
  if (!job || job.status === 'succeeded' || job.status === 'running') return { skipped: true }
  await deps.markRunning(job.id)
  const submission = await deps.provider.submit(...)
  const result = await deps.provider.poll(submission)
  const asset = await deps.createOutputAsset(job, result)
  await deps.markSucceeded(job.id, result, asset)
  return { skipped: false, status: 'succeeded' }
}
```

- [ ] **Step 4: Add Worker shell**

`workers/video-generation/src/index.ts` reads Cloudflare queue messages and delegates to `processVideoGenerationJob`. The first shell can log and fail closed if provider credentials are absent.

- [ ] **Step 5: Run tests and verify GREEN**

Run the same Vitest command. Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add server/utils/video-generation/providers workers/video-generation test/video-generation/providerAdapter.test.ts test/video-generation/worker.test.ts
git commit -m "feat(video): add generation worker provider boundary"
```

---

## Task 5: Full Verification And Docs

**Files:**
- Modify: `workers/audio-jobs/DEPLOYMENT.md` or create `workers/video-generation/DEPLOYMENT.md`
- Modify: `docs/OUTSTANDING-MERGE-WORK.md` if the backlog references AI video generation status

- [ ] **Step 1: Run focused test suite**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm exec vitest run test/video-generation test/config/renderQueueBindings.test.ts
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm run typecheck
```

Expected: pass or report pre-existing unrelated type errors explicitly.

- [ ] **Step 3: Run diff check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Commit docs/verifications if changed**

Run:

```bash
git add workers/video-generation/DEPLOYMENT.md docs/OUTSTANDING-MERGE-WORK.md
git commit -m "docs(video): document generation worker activation"
```

Skip commit if no docs changed.

- [ ] **Step 5: Prepare PR summary**

Summarize:

- generation remains dormant unless flags and tenant policies enable it
- vehicle text-to-video is hard-blocked
- output assets flow into existing `video_assets`
- no live provider calls in tests

---

## Self-Review Notes

- The plan covers every approved spec section: registry, compliance, cost caps, persistence, queue, API, worker/provider, tests, and dormant activation.
- No task exposes live generation by default.
- Existing V1 render and distribution paths are unchanged.
- The plan uses the existing `video_assets` table from migration 174 rather than introducing a conflicting output asset table.
