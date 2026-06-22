# Video Generation → Cloudflare Workflows — Migration Design

**Date:** 2026-06-22
**Status:** Design for review (the first concrete step of the approved Workflows direction)
**Parent direction:** `docs/superpowers/specs/2026-06-21-cloudflare-workflows-enterprise-task-execution-design.md`
**Scope:** Migrate the **video-generation** pipeline from queue + consumer-worker + reconcile-cron onto a
single Cloudflare **Workflow**. Non-financial, behind a cutover flag, fully reversible.

---

## 1. Why this pipeline first

It's the textbook case from the parent direction: a multi-step, retry-heavy, **wait-for-an-external-
provider** flow whose reliability is currently hand-rolled across three places. It's also **non-financial**
(safe to prove the pattern on) and composes cleanly with the dormant MCP 2b video suite (§7).

## 2. Current pipeline (what we're replacing)

```
confirm / jobs.post  ──(synchronous)── compliance + ATOMIC budget reservation → job row 'queued'
        │                                                            └─ returns cap_exceeded immediately
        └─ enqueue(VIDEO_GENERATION_QUEUE, { jobId, tenantId, idempotencyKey, sourceAssetUrls })
                │
   workers/video-generation (queue consumer · processVideoGenerationJob)
        getJob → guard(skip if terminal/running) → provider.submit → markRunning(providerRequestId)
        ├─ async provider 'queued'  → LEAVE 'running', return  ─────────────┐
        ├─ poll 'running'           → LEAVE 'running', return  ─────────────┤  (no durable wait here)
        └─ 'succeeded'             → finalize(download→R2→asset) → markSucceeded
                                                                              │
   /api/cron/video-generation-reconcile (every N min)  ◀─────────────────────┘
        find 'running' jobs → provider.poll(request_id) → finalize  |  reap >20min as 'failed'
```

**Hand-rolled-orchestration pain (the liability):**
- **Two finalize paths** (consumer poll-branch + reconcile cron) — duplicated, drift-prone.
- **"Leave it running, the cron will finish it"** is a manual polling workaround for async providers.
- **The reconcile cron is the durability backstop** — and "crons that never fired" is in our incident
  history. If it doesn't run, async jobs hang in `running` forever.
- The `running → succeeded/failed` state machine + stale-reaping are all hand-managed.

## 3. Target design — one `VideoGenerationWorkflow`

The synchronous front (compliance + **atomic budget reservation**) **stays exactly as-is** — it must return
`cap_exceeded` to the caller (jobs.post / MCP confirm) before any work starts. Only the post-reservation
async tail (submit → await provider → finalize) moves into the Workflow. The trigger swaps
`enqueue(...)` → `env.VIDEO_GENERATION_WORKFLOW.create({ id: jobId, params: { jobId, tenantId, idempotencyKey, sourceAssetUrls } })`.

**Steps** (each a durable `step.do(...)`; all wrap the *existing* pure functions — `provider.submit/poll`,
`finalizeVideoGenerationJob`, `markRunning/Succeeded/Failed` — so logic is reused, not rewritten):

```
run(event, step):
  job = step.do('load-job', () => getJob(jobId))            // skip if terminal/running (idempotent re-entry)
  sub = step.do('submit', {retries:{limit:3,delay:'10s',backoff:'exponential'}},
                () => provider.submit(job) )                 // → providerRequestId
        step.do('mark-running', () => markRunning(job.id, sub.providerRequestId))

  // Durable wait-for-provider — REPLACES the reconcile cron entirely:
  result = null
  for (attempt of 1..MAX_POLLS):                             // MAX_POLLS × interval ≤ provider SLA window
     r = step.do(`poll-${attempt}`, {retries:{limit:2}}, () => provider.poll(sub))
     if (r.status !== 'running') { result = r; break }
     step.sleep(`wait-${attempt}`, '30 seconds')             // hibernates — no compute billed while waiting
  if (!result || result.status==='running')                  // exceeded the window → reap (was the cron's job)
     step.do('reap', () => markFailed(job.id, 'provider did not complete in window')); return

  if (result.status !== 'succeeded' || !result.outputUrl)
     step.do('fail', () => markFailed(job.id, result.errorMessage)); return

  asset = step.do('finalize', {retries:{limit:3,delay:'15s'}}, () => finalizeVideoGenerationJob(job, result))
  // finalize already: download output → R2 → createGeneratedVideoAsset → markSucceeded (idempotent)
```

**Why this is strictly better:** the durable `poll + sleep` loop *is* the reconcile cron, but per-job,
automatic, and retried — no separate cron to wire or watch. One finalize path. The state machine is the
workflow's control flow, persisted by the platform.

## 4. Idempotency, retries, limits

- **Re-entry safe:** `load-job` skips terminal/running on a retried run; `markSucceeded` is already a
  no-op when finalized (status guard); `provider.submit` is guarded by the job's `providerRequestId`
  (if set on re-entry, skip re-submit and go straight to polling). The upstream `idempotencyKey` already
  prevents duplicate job rows.
- **Retries with backoff** per step (submit/poll/finalize) replace the manual reconcile retry — transient
  provider/network errors self-heal; a step that exhausts retries fails the job cleanly.
- **30-min/step ceiling:** `submit` and `poll` are fast; `sleep` hibernates (not a step). **`finalize` is
  the one to watch** — it currently buffers the whole output in memory (a TODO in `finalize.ts`). Action:
  switch finalize to a **streamed R2 upload** before enabling large/high-res models, keeping it well under
  30 min. Short gated-model clips are already fine. (10k-step / 10MB-state limits are not at risk:
  MAX_POLLS is bounded to the provider SLA, ~10–20 polls.)

## 5. Where it runs (bindings)

- The Workflow class lives in a **companion Worker** — reuse `workers/video-generation/` (it already holds
  the providers, DB adapter, and R2 download). Convert it from a queue-consumer into the Workflow host:
  declare `[[workflows]] binding = "VIDEO_GENERATION_WORKFLOW", class_name = "VideoGenerationWorkflow"`.
- The **Pages app** gets a matching `[[workflows]]` binding (cross-script, like our DO bindings) so
  `jobs.post` / MCP confirm can call `env.VIDEO_GENERATION_WORKFLOW.create(...)`.
- Keep the producer queue binding during cutover; remove it (and the consumer + reconcile cron) once the
  workflow path is proven.

## 6. Cutover & rollback (reversible)

- Flag **`VIDEO_GENERATION_USE_WORKFLOW`** (in `wrangler.toml [vars]`, default off):
  - off → existing `enqueue` path (unchanged).
  - on → `runWorkflow` path.
- The job **table schema is unchanged** — the workflow writes the same `video_generation_jobs` rows the
  cron/consumer do, so dashboards, the MCP 2b status tool, and reads all keep working under either path.
- **Rollback = flip the flag back.** In-flight workflows finish on their own; new jobs use the queue again.
- **Retire** the queue consumer + `video-generation-reconcile` cron only after a bake-in period with the
  flag on and zero stuck jobs.

## 7. Composition with MCP 2b (no rework)

2b's `dispatchVideoConfirm` reserves budget then calls `enqueueVideoGeneration(...)`. Under this migration
that single call becomes `env.VIDEO_GENERATION_WORKFLOW.create(...)` gated by the same flag — a **one-line
swap in `buildVideoConfirmDeps().enqueue`**, no change to the MCP surface, tools, or tests. 2b ships on the
queue path today and inherits the Workflow path later for free.

## 8. Testing

- **Unit:** the step bodies already are the tested pure functions (`processVideoGenerationJob` deps,
  `finalizeVideoGenerationJob`, providers). Add a workflow-orchestration test driving a fake `step` that
  records `do/sleep` calls: assert submit→mark-running→poll-loop→finalize ordering, re-entry idempotency
  (no double submit/finalize), reap-on-window-exceeded, and fail-on-provider-error.
- **Parity:** run the workflow path against the same fixtures as the consumer/reconcile and assert identical
  `video_generation_jobs` end states.
- **Operator live-verify (gated):** flag on for one tenant, run a real generation, confirm the job reaches
  `succeeded` with the R2 asset — and that **no reconcile cron ran**.

## 9. Risks

- **Workflows maturity / vendor concentration** — mitigated by the pure-step rule (logic stays portable).
- **finalize memory ceiling** — must stream before large models (already flagged in `finalize.ts`).
- **Cross-script workflow binding from Pages** — verify the binding wiring on a preview deploy first (same
  class of setup as our DO bindings, which work).

## 10. Out of scope

- Migrating other pipelines (spend/GA4 sync, then financial EOM last) — separate specs after this proves out.
- The synchronous reservation/compliance front (unchanged).
- Any change to the MCP 2b tool surface (only the internal enqueue call swaps, later, behind the flag).
