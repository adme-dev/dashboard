# MCP Server Phase 2 — Task List

Backlog derived from `ai-copilot-mcp-server-phase2.md`. **Nothing here is enabled without per-group
operator sign-off.** Order follows the spec's phasing (2a → 2d). Each task notes what's **reused** vs
**net-new**.

> **STATUS 2026-06-21:** Generation track **2a BUILT + tested, dormant** (branch `feat/mcp-phase2-2a`,
> merged to main). D1–D3 accepted (recommended answers). **2b/2c/2d remain — see notes; 2c held for
> sign-off (D4 unsettled), 2d needs banner async-ification.**

## Decisions to settle first (spec §10)
- [x] **D1.** Ship generation before writes — **YES** (accepted 2026-06-21).
- [x] **D2.** Two-step `propose/confirm` now, elicitation later — **YES** (accepted).
- [x] **D3.** Per-group enable flags — **YES** (`MCP_GEN_TOOLS_ENABLED` shipped; `MCP_WRITE_TOOLS_ENABLED` for 2c).
- [ ] **D4.** Do external hosts get `rich_confirm` actions (budget/EOM/e-sign) in 2c, or hold to in-app? — **OPEN, blocks 2c** _(conservative default: hold)_
- [ ] **D5.** MCP-session pending-action keying: extend `ai_pending_actions` vs. dedicated table? — blocks 2c

## Shared foundation
- [x] **F1.** Action guard — shipped as `executeGenerationTool` in `generationTools.ts` (parallels `executeReadOnlyTool`: disabled/not_found/forbidden/bad_args/handler_error, never throws). A generic `executeActionTool` for writes can follow the same shape in 2c.
- [x] **F2.** Internal surface — **reused existing `/internal/mcp/call`** (routes generation tools to the generation guard) instead of new endpoints; Worker needs no change. Writes (2c) may still want `/action` + `/confirm`.
- [ ] **F3.** MCP-session pending-action keying — for 2c writes only (gated by D5).
- [x] **F4.** Per-group flag `MCP_GEN_TOOLS_ENABLED` documented in `wrangler.toml` (left unset = off). `MCP_WRITE_TOOLS_ENABLED` for 2c.
- [x] **F5.** Per-MCP-actor rate limit — **shipped for generation** (`rateLimit.ts`: 20 calls / 10 min per user via audit-ledger count, `get_generation_status` poll exempt). Reusable for 2c.
- [x] **F6.** Audit — generation calls audited via the existing `/call` path (`payload.source='mcp'`, arg keys only).

## 2a — Generation, low-risk subset (flag: `MCP_GEN_TOOLS_ENABLED`) — ✅ BUILT (dormant)
- [x] **A1.** `generate_voiceover` (sync) → `generationRunner` wraps `generateVoiceover` + `createVoiceAsset`. CREATIVE-gated.
- [x] **A2.** `start_music_generation` (async `MUSIC_QUEUE`) → reuses artist-blocklist + idempotency + no-double-bill; returns `{jobId,status}`; copyright/duplicate/unavailable return structured status.
- [x] **A3.** `get_generation_status(jobId)` → wraps `getAsset` (mints fresh stream URL).
- [x] **A4.** Tests — 10 unit tests (projection flag-gating + role-scoping; guard disabled/not_found/forbidden/bad_args/handler_error). 561 AI tests green overall.
- [ ] **A5.** Live-verify in Claude (operator, after flag flip): generate a voiceover + music track; confirm R2 assets + `ai_action_audit` rows.

## 2b — Video generation (same/sub flag) — ⚠️ NOT a clean additive slice
> Unlike audio, `video/generation/jobs.post` requires a `projectId` + existing AV timeline, is gated by
> a separate `VIDEO_GENERATION_ENABLED`, and wraps model-registry + tenant-gating + compliance +
> advisory-locked budget reservation across ~12 deps. Awkward for a conversational MCP host (can't t2v
> without first setting up a project) and higher-risk to wrap (billing/compliance). **Needs a design
> decision before building — is video-over-MCP wanted given the project/timeline requirement?**
- [ ] **B1.** `start_video_generation` → proxies `video/generation/jobs` (async `VIDEO_GENERATION_QUEUE`); pass mode/model/prompt/sourceAssetIds/duration; require `projectId`. _(reuse engine)_
- [ ] **B2.** Surface existing gates as clean tool errors: compliance `blocked` (422) and **`402 cap_exceeded`** from the atomic per-tenant budget lock (`server/utils/video-generation/budget.ts`). _(reuse gates; new error mapping)_
- [ ] **B3.** Extend `get_generation_status` to route video jobs (`video/generation/jobs/[id]`). _(reuse)_
- [ ] **B4.** Tests: cap-exceeded + compliance-blocked return terminal explained errors (no enqueue); i2v happy path.
- [ ] **B5.** Live-verify (operator): i2v from an approved still; confirm budget decrement + asset finalize.

## 2c — Writes (flag: `MCP_WRITE_TOOLS_ENABLED`) — ✅ BUILT (dormant, non-financial subset)
> **Migration approach taken (operator-approved 2026-06-21).** Mig 189 made `ai_pending_actions.
> conversation_id` nullable + added `source`; `proposeAction` accepts null + stamps `ctx.source`; the 7
> non-financial confirm-tier propose-handlers now run under `source='mcp'` (conv_id NULL) — REUSING
> their resolution. `writeTools.ts` + `executeWriteConfirm` wired into `/internal/mcp/call` (propose →
> proposalId; `confirm_action` atomically claims + dispatches to the existing executor). Dormant behind
> `MCP_WRITE_TOOLS_ENABLED` (off). 13 tests; 577 AI green; no chat regression.
- [x] **C1.** `create_task`, `propose_schedule_post`, `assign_task`, `propose_status_change`, `propose_brief_convert` — propose/confirm via existing executors.
- [x] **C2.** CRM/creative/knowledge: `propose_opportunity`, `log_crm_activity`, `propose_proof_status`, `propose_team_memory`, `propose_knowledge_article`.
- [ ] **C3.** 🛑 `rich_confirm` + financial (`propose_budget_change`, `propose_quote`, `propose_eom_generate`, `propose_budget_alert`, `propose_expense_*`) — EXCLUDED, held for **D4**. (confirm path already enforces `ack` + re-checks permission when these are eventually added.)
- [x] **C4.** Tests: flag-gating, role-scoping, financial exclusion, atomic single-use claim (`expired`), `confirm_required` for rich_confirm, permission re-check, never-throws.
- [ ] **C5.** Live-verify (operator): propose→confirm a task + a schedule_post from an external host; confirm single execution + audit.

## 2d — Banner render (after async-ification; spec §7.1) — 🛑 BLOCKED (changes live behavior + migration)
> Async-ifying `banner-studio/export-video` changes existing sync behavior and needs a status table
> (migration) — crosses the dormant-build hard-stops. Needs operator go-ahead before building.
- [ ] **D2a.** Move `banner-studio/export-video` off in-request ffmpeg onto `VIDEO_RENDER_QUEUE` + a status row. _(net-new; prerequisite)_
- [ ] **D2b.** `start_banner_render` + status routing once async exists. _(reuse new async path)_

## Marketing / docs sync at go-live (per CLAUDE.md)
- [ ] **M1.** Update the connector page + `features/ai-connectors` to reflect newly-live generation/action tools when each group ships (today they're described as read-only).

---
**Quick-start when ready:** settle D1–D3 → F1, F2, F4, F6 → A1–A3 → tests → operator live-verify (A5).
