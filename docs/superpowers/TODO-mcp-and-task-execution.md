# TODO — MCP + Task Execution (consolidated)

**Updated:** 2026-06-21 · **Owner legend:** 🧑 operator (Paul) · 🤖 agent (build) · ⛔ blocked
**Source threads:** MCP Phase 1/2 handoff, MCP 2b build (this session), Cloudflare Workflows direction (this session).

> Scannable backlog of everything in flight or decided across MCP and the platform's task-execution layer.
> Nothing here flips a flag, deploys, or moves money without explicit 🧑 sign-off.

---

## A. MCP Phase 2b — Video generation suite (IN PROGRESS)
Spec: `docs/superpowers/specs/2026-06-21-mcp-phase2b-video-generation-design.md` ·
Plan: `docs/superpowers/plans/2026-06-21-mcp-phase2b-video-generation.md` · Branch: `feat/mcp-phase2b-video`

- [x] 🤖 Task 1 — read tools: descriptors, projection, guard (pure) — *committed `9d13e278`*
- [x] 🤖 Task 2 — read runner + wire reads into internal endpoints — *committed `6fe5f859`*
- [x] 🤖 Task 3 — `propose_video_generation` + `create_video_project` validate/preview (no spend) — *committed `894b8421`*
- [ ] 🤖 Task 4 — `dispatchVideoConfirm` (reserve+enqueue / create project, `cap_exceeded`)
- [ ] 🤖 Task 5 — propose/confirm binding deps in `videoRunner.ts` (engine wiring)
- [ ] 🤖 Task 6 — generalize shared confirm + wire propose/confirm into `/call`, manifest, flags, rate-limit
- [ ] 🤖 Task 7 — dormant flags in `wrangler.toml` + full `test/ai/` run + lint + go-live docs note
- [ ] 🧑 Open the PR + review once Tasks 4–7 land (then squash-merge to `main`).
- [ ] 🧑 **Activate (post-merge, needs sign-off):** set `MCP_VIDEO_TOOLS_ENABLED` + `MCP_VIDEO_GEN_ENABLED` in `wrangler.toml [vars]` → deploy from clean worktree.
- [ ] ⛔🧑 **Dependency:** bake base `VIDEO_GENERATION_ENABLED="true"` into `wrangler.toml [vars]` — currently ABSENT, so the engine 404s. 2b is *doubly-dormant* until this is set. Confirm prod state of base video-gen first.
- [ ] 🧑 Live-verify (after both flag sets + base flag): `list_video_models` → `propose_video_generation` (t2v) → confirm cost → `confirm_action` → poll status → asset finalize + budget decrement + `ai_action_audit` rows.
- [ ] 🤖 M1 marketing/docs sync **at go-live**: connector page + `features/ai-connectors` (today say read-only/audio-gen).

## B. Cloudflare Workflows — enterprise task-execution backbone (DIRECTION SET)
Doc: `docs/superpowers/specs/2026-06-21-cloudflare-workflows-enterprise-task-execution-design.md`

- [x] 🤖 Direction + caveats + rollout documented (verdict: adopt as durable-execution backbone, incremental, off real-time + financial paths until proven).
- [ ] 🤖 **Next concrete step:** write the **video-generation → Workflow migration spec** (steps as pure fns, companion-Worker `workflows` binding, idempotency, retry/backoff, observability, cutover + rollback, retire `video-generation-reconcile` cron).
- [ ] 🤖 Validate longest step vs the **30 min/step** ceiling (Chromium render path especially); decompose if needed.
- [ ] 🧑 Decide go/no-go on the video-gen Workflow migration after reviewing the spec.
- [ ] 🤖 (later) Then sync pipelines (spend, GA4); **financial pipelines (EOM/invoicing/spend-writes) LAST**, only after the pattern is proven.
- [ ] 🤖 Governance per migrated pipeline: idempotency keys, dead-letter handling, stuck/failed-run alerting, runbook. **Pure-step rule is non-negotiable.**
- [ ] — Do NOT adopt the full Agents SDK or migrate the real-time voice/chat loop (Workflows is not for real-time).

## C. Standing MCP decisions (BLOCK further write scope — 🧑 call)
From the Phase 1/2 handoff; unchanged this session.

- [ ] ⛔🧑 **D4** — do external hosts ever get **financial** writes (`budget_change` / `quote` / `eom_generate` / `budget_alert` / `expense_*`)? Held to in-app until decided. Until then excluded everywhere. *(Note: 2b video spend is its OWN confirm action under its own flags — explicitly NOT part of D4's Xero-financial set.)*
- [ ] 🧑 **Activate 2c writes** (non-financial, already built + dormant): uncomment `MCP_WRITE_TOOLS_ENABLED="true"` → deploy → e2e `propose_create_task` → `confirm_action`.
- [ ] ⛔🧑 **2d banner render** — only after async-ifying `banner-studio/export-video` (changes live sync behavior + needs a status table/migration). Needs go-ahead before building.

## D. Operator e2e checks (outstanding, none blocking)
- [ ] 🧑 **2a** — generate a voiceover + a music track from the Claude connector → confirm R2 asset + `ai_action_audit` row.
- [ ] 🧑 **2c** — once activated: propose→confirm a task + a schedule_post from an external host → confirm single execution + audit (`source='mcp'`).
- [ ] 🧑 **2b** — see §A live-verify.

## E. Cross-cutting reliability (surfaced by the Workflows review — pre-existing toil)
These are the hand-rolled-orchestration weak spots Workflows would consolidate; track independently in case Workflows slips.
- [ ] 🧑/🤖 Audit companion-Worker queue consumers are all wired (history: agency-jobs had no consumer; crons that never fired).
- [ ] 🧑/🤖 Confirm cron triggers fire in prod (anomaly/office/tracking/ga4-sync history).
- [ ] — Keep `AI_TOOLS_ENABLED` ON every deploy (tool-calling agent depends on it).

---
**Immediate next action (🤖):** finish 2b Tasks 4–7, then open the PR. **Immediate next decision (🧑):** D4, 2c activation, and go/no-go on the video-gen Workflow migration spec.
