# Cloudflare Workflows for Enterprise Task Execution — Direction & Design

**Date:** 2026-06-21
**Status:** Recommendation accepted (direction); first migration (video-gen) to be planned separately.
**Author context:** Emerged from a review of whether Cloudflare Workflows (Agents docs:
`/agents/concepts/workflows/`, `/agents/runtime/execution/run-workflows/`) should underpin our MCP,
voice assistant, and general platform task execution.
**Relates to:** the dormant MCP Phase 2b video suite (`2026-06-21-mcp-phase2b-video-generation-design.md`)
— they compose; see §6.

---

## 1. The problem (honest framing)

What is not enterprise-grade today is not a missing feature — it is that our async-execution layer is a
**sprawl of hand-rolled orchestration**. Every pipeline re-implements the same loop:

> enqueue → process → await external (provider/poll/webhook) → finalize → handle failure → reconcile stragglers

…across multiple Queues, companion Workers as consumers, reconcile crons, status tables, webhooks, and
idempotency keys. That bespoke reliability code is where our incidents originate. The operational record
is blunt about it: *"agency-jobs queue had no consumer," "cron never fired," "ga4-sync hang," "spend sync
stuck running / 0-processed."* Each is a hand-rolled-orchestration failure, not a business-logic bug.

Pipelines carrying this pattern today (non-exhaustive): music-gen, **video-generation** (+ a
`video-generation-reconcile` cron), video-render, timeline-render, spend sync, GA4 sync, EOM invoice
generation.

## 2. What Cloudflare Workflows is (grounded in the docs)

A **managed durable-execution engine**:
- **Step-level persistence** — a completed `step.do("name", fn)` is not re-executed on restart (exactly-once steps).
- **Automatic retries with backoff** — e.g. `retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }`.
- **Wait-for-event / approvals** — a run can pause for an external event for **up to one year**; sleep for days.
- **Queryable status/history** — `getWorkflowStatus`/`getWorkflows`, completion callbacks.
- **Co-located** with our existing edge (R2, Durable Objects, Queues, AI Gateway) — no extra infra, no
  cross-cloud egress. Usable as a **standalone Worker `workflows` binding** — we do NOT need to adopt the
  full Agents SDK to use the primitive (important: we are Pages-first with companion Workers).

**Hard limits (design constraints, not footnotes):** 30 min / step, 10,000 steps, 10 MB state per run.
**Explicitly not for:** real-time chat/WebSockets, sub-30s tasks.

## 3. Verdict

**Adopt Workflows as the durable-execution backbone for background pipelines — as a deliberate,
incremental consolidation, kept off the real-time and financial paths until proven.**

The enterprise value is not new capability; it is **fewer failure modes and far less operational toil per
pipeline**: no "consumer wasn't wired" outages, automatic retry instead of manual backfill, built-in
observability instead of grepping Worker logs. It is a **step-change in reliability-per-line-of-code** over
what we hand-roll today — and it is the right direction *because* of our incident history, not in spite of it.

## 4. Caveats put in writing

1. **Vendor concentration.** We are already all-in on Cloudflare; Workflows deepens single-vendor risk on a
   younger product. **Mitigation (mandated discipline): keep each step as a plain, pure function; the
   Workflow is a thin durable shell.** This keeps step logic portable (Temporal / Step Functions escape
   hatch) and unit-testable.
2. **The enterprise alternative is Temporal** (or AWS Step Functions) — richer versioning/signals/scale,
   battle-tested. For *our* stack and scale, CF Workflows' co-location + zero-extra-ops beats Temporal's
   richness. Reach for Temporal only if we expect to exceed CF's limits or get a multi-cloud mandate. Do
   not adopt it preemptively.
3. **Limits bite.** A long Chromium render or a large EOM batch can exceed 30 min/step or 10 MB state —
   decompose at design time.
4. **It does not make the voice/chat assistant enterprise-grade.** That is a different problem (streaming
   latency, barge-in, session durability) in our DO/session layer. Workflows is not for real-time. Do not
   let it over-scope.

## 5. Fit per area

| Area | Fit | Rationale |
|---|---|---|
| **Platform background pipelines** | 🟢 Strong — primary target | Directly replaces the queue + reconcile-cron + status-table + webhook sprawl with durable steps + native retries + wait-for-event. |
| **MCP** | 🟡 Indirect | The async tools an MCP host triggers (music, 2b video) *are* those pipelines — they benefit when migrated. The propose→confirm HITL maps to Workflows' wait-for-approval, but our `ai_pending_actions` table is simpler, built, and RBAC/audit-integrated for short single-confirm. Do not migrate the confirm mechanism; optionally use a Workflow for the *execute* side of expensive confirmed actions. |
| **Voice / chat assistant** | 🔴 Keep live loop as-is | Workflows is not for real-time. The win is offloading the agent's long side-effects ("generate a video and post it", "run EOM and email it") to a Workflow it kicks off and polls — not rewriting the conversation. |

## 6. Composition with MCP Phase 2b (in flight)

2b's confirmed generation calls `enqueueVideoGeneration(...)` inside `dispatchVideoConfirm`. If video-gen
later becomes a Workflow, that single call swaps to `runWorkflow(...)` — a localized change, no redesign.
**2b neither blocks nor is blocked by a Workflows migration; they compose.** Build 2b on the current
queue path now; migrate the underlying pipeline to a Workflow later without touching the MCP surface.

## 7. Rollout plan (enterprise discipline)

Sequenced by blast radius; **prove the pattern before money moves through it.**

1. **First: video-generation pipeline (non-financial).** It already carries the reconcile-cron +
   provider-poll complexity Workflows eliminates. Convert: `reserve+create job` → `call provider` →
   `poll/await provider (or wait-for-webhook-event)` → `finalize + R2 upload` → `derive variants`. Each a
   pure step; the Workflow is the shell. Retire the `video-generation-reconcile` cron once durable retries
   cover it. Earn observability + on-call experience here.
2. **Then: sync pipelines** (spend, GA4) — same shape, low risk.
3. **Last: financial pipelines** (EOM, invoicing, spend-writes) — highest value *and* highest cost-of-bug.
   Only after the pattern is proven.

**Governance wrapped around every migrated pipeline:** explicit idempotency keys (already used),
dead-letter handling, alerting on stuck/failed runs, and a runbook. The **pure-step rule** (§4.1) is
non-negotiable — it is what keeps steps testable and portable.

## 8. Next concrete step

Plan the **video-generation → Workflow** migration as its own spec (steps, binding/wrangler config on a
companion Worker, idempotency, retry/backoff policy, observability, cutover + rollback, and retiring the
reconcile cron). Validate the longest step against the 30-min ceiling (Chromium render path especially).

## 9. Out of scope

- Adopting the full Cloudflare Agents SDK (agents-as-DO) — use the Workflows primitive standalone.
- Migrating the real-time voice/chat loop.
- Any change to the dormant MCP 2b surface (it composes; see §6).
