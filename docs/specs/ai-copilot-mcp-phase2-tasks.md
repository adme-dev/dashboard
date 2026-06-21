# MCP Server Phase 2 — Task List

Backlog derived from `ai-copilot-mcp-server-phase2.md`. **Nothing here is enabled without per-group
operator sign-off.** Order follows the spec's phasing (2a → 2d). Each task notes what's **reused** vs
**net-new**.

## Decisions to settle first (spec §10) — blocking
- [ ] **D1.** Ship generation (2a) before any writes? _(spec recommends yes)_
- [ ] **D2.** Two-step `propose/confirm` now, elicitation later? _(spec recommends yes)_
- [ ] **D3.** Per-group enable flags vs. one Phase-2 flag? _(spec recommends per-group)_
- [ ] **D4.** Do external hosts get `rich_confirm` actions (budget/EOM/e-sign) in 2c, or hold to in-app? _(conservative default: hold)_
- [ ] **D5.** MCP-session pending-action keying: extend `ai_pending_actions` vs. dedicated table?

## Shared foundation (needed before any group ships)
- [ ] **F1.** Add `executeActionTool(tools, name, args, ctx)` in `server/utils/ai/mcp/project.ts` — gated path parallel to `executeReadOnlyTool`; per-group flag check, role re-check, riskTier gating, audit. _(net-new, mirrors existing guard)_
- [ ] **F2.** Internal endpoints behind `x-mcp-secret`: `POST /api/internal/mcp/action`, `/confirm`, `/job-status`. _(net-new; thin proxies)_
- [ ] **F3.** Pending-action keying for MCP sessions — additive migration on `ai_pending_actions` (nullable `mcp_session_id` / `source='mcp'`), claim scoped to creating actor, keep 30-min TTL. _(net-new, small; gated by D5)_
- [ ] **F4.** Per-group env flags, default off: `MCP_GEN_TOOLS_ENABLED`, `MCP_WRITE_TOOLS_ENABLED` (in `wrangler.toml [vars]`, per the activation gotcha). _(net-new)_
- [ ] **F5.** Per-MCP-actor action rate limit on the confirm/start path. _(net-new; spec §7.4)_
- [ ] **F6.** Audit: every action/generation call → `ai_action_audit`, `payload.source='mcp'`, arg KEYS only. _(reuse Phase-1 audit)_

## 2a — Generation, low-risk subset (flag: `MCP_GEN_TOOLS_ENABLED`)
- [ ] **A1.** `generate_voiceover` tool → proxies `audio/voiceover.post` (sync). Require+validate `clientId`; cap text length; reuse text-sanitize + channel LUFS gates. _(reuse engine)_
- [ ] **A2.** `start_music_generation` → proxies `audio/music/generate` (async `MUSIC_QUEUE`); returns `{jobId,status,estimateCents}`. Reuse artist-blocklist 422 + idempotency + no-double-bill. _(reuse engine)_
- [ ] **A3.** `get_generation_status(jobId)` → wrap `audio/music/status/[id]`; normalized shape `{status, assetUrl?, error?, costCents?}`. _(reuse status endpoint)_
- [ ] **A4.** Tests: projection lists gen tools only when flag on; voiceover sync happy-path; music start→status lifecycle; role-scoping; audit row written.
- [ ] **A5.** Live-verify in Claude (operator): generate a voiceover + a music track end-to-end; confirm assets land in R2 + audit rows.

## 2b — Video generation (same/sub flag)
- [ ] **B1.** `start_video_generation` → proxies `video/generation/jobs` (async `VIDEO_GENERATION_QUEUE`); pass mode/model/prompt/sourceAssetIds/duration; require `projectId`. _(reuse engine)_
- [ ] **B2.** Surface existing gates as clean tool errors: compliance `blocked` (422) and **`402 cap_exceeded`** from the atomic per-tenant budget lock (`server/utils/video-generation/budget.ts`). _(reuse gates; new error mapping)_
- [ ] **B3.** Extend `get_generation_status` to route video jobs (`video/generation/jobs/[id]`). _(reuse)_
- [ ] **B4.** Tests: cap-exceeded + compliance-blocked return terminal explained errors (no enqueue); i2v happy path.
- [ ] **B5.** Live-verify (operator): i2v from an approved still; confirm budget decrement + asset finalize.

## 2c — Writes (flag: `MCP_WRITE_TOOLS_ENABLED`)
- [ ] **C1.** `confirm`-tier pairs first: `propose_task`/`confirm_task`, `propose_schedule_post`/`confirm_…`. Map to existing executors. _(reuse executors)_
- [ ] **C2.** Lower-risk CRM/finance pairs: `propose_opportunity`, `log_crm_activity`, `propose_proof_status`, `propose_expense_*`. _(reuse)_
- [ ] **C3.** `rich_confirm` pairs (gated by D4): `propose_budget_change`, `propose_quote`, `propose_eom_generate` — `confirm_*` requires `ack:true`; proposal returns full diff summary. _(reuse staged guardrail chains)_
- [ ] **C4.** Tests: propose persists no mutation; confirm claims atomically + executes once; rich_confirm without ack → `confirm_required`; expired/duplicate claim safe.
- [ ] **C5.** Live-verify (operator): propose→confirm a task + a schedule_post from an external host; confirm single execution + audit.

## 2d — Banner render (after async-ification; spec §7.1)
- [ ] **D2a.** Move `banner-studio/export-video` off in-request ffmpeg onto `VIDEO_RENDER_QUEUE` + a status row. _(net-new; prerequisite)_
- [ ] **D2b.** `start_banner_render` + status routing once async exists. _(reuse new async path)_

## Marketing / docs sync at go-live (per CLAUDE.md)
- [ ] **M1.** Update the connector page + `features/ai-connectors` to reflect newly-live generation/action tools when each group ships (today they're described as read-only).

---
**Quick-start when ready:** settle D1–D3 → F1, F2, F4, F6 → A1–A3 → tests → operator live-verify (A5).
