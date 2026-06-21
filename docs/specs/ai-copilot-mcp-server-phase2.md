# AI Copilot — MCP Server Phase 2 (Actions + Generation)

**Status:** DRAFT for sign-off. Design only — nothing in this spec enables a write or generation
tool over MCP. Phase 1 (`ai-copilot-mcp-server-phase1.md`) shipped read-only and is live; its
`executeReadOnlyTool` guard hard-blocks every `mutates: true` tool. Phase 2 is the sanctioned next
scope. **No write/generation tool ships enabled without explicit operator go-ahead per tool group.**

## 1. Goal

Let an external AI host (Claude / Cursor / ChatGPT), connected as the signed-in staff member, do the
"act + create" half of the day we can already *read and reason* about — submit/stage changes and
generate owned media — under the same RBAC, the same audit trail, and a mandatory confirm step for
anything that costs money or changes platform state.

**Lead with generation, not writes.** The generation engines already ship (Audio Studio live, AI
Video flag-on); exposing them is *plumbing, not new ML*, it is our clearest differentiator (owned,
licence-clear, budget-capped vs. raw fal/ElevenLabs), and the async + confirm machinery it forces us
to build is the same machinery the `propose_*` writes need.

## 2. Two cross-cutting design problems (and the chosen answers)

### 2a. Long-running work over a request/response protocol → **start + poll**

`tools/call` is synchronous, but music and video generation are async queue jobs (minutes). Do **not**
block. Each long job is a pair:

- `start_<thing>` → validates, runs the existing pre-flight gates (budget, compliance, idempotency),
  enqueues, returns `{ jobId, status: 'queued', estimateCents }` immediately.
- `get_generation_status(jobId)` → returns `{ status, assetUrl?, error?, costCents? }`.

The host's agent loop polls naturally (this is exactly how the fal/video-gen MCPs in the ecosystem
work). MCP progress notifications are a later enhancement, not a dependency.

### 2b. Acting safely over MCP → **two-step propose/confirm tools** (not elicitation)

MCP elicitation (2025-06 spec) is unevenly supported across hosts. Use a host-agnostic two-step that
maps 1:1 onto our existing HITL chain:

- `propose_<action>(...)` → **no mutation**; persists to a pending-actions row, returns
  `{ proposalId, summary, riskTier }` (human-readable diff: current → proposed, %, rollback line).
- `confirm_<action>(proposalId, ack?)` → atomically claims the row and dispatches to the existing
  executor registry. `riskTier: 'rich_confirm'` (budgets, e-sign, EOM) **requires `ack: true`**.

This reuses `proposeAction` → `ai_pending_actions` → executor (`server/utils/ai/executors/`) verbatim;
the only new surface is MCP-session-scoped pending rows (see §6). Elicitation can later collapse this
to one call where a host supports it, with no protocol change for the others.

## 3. The new guard: `executeActionTool`

Phase 1's `executeReadOnlyTool` stays the read path and keeps hard-blocking `mutates`. Phase 2 adds a
**separate, explicitly-gated** path in `server/utils/ai/mcp/project.ts`:

```
executeActionTool(tools, name, args, ctx):
  1. tool not found            → { ok:false, code:'not_found' }
  2. tool group not enabled    → { ok:false, code:'disabled' }   // per-group env flag, default off
  3. role lacks requiredPermission (filter + re-check) → 'forbidden'
  4. args fail Zod             → 'bad_args'
  5. riskTier needs confirm AND this is a *_start/propose call → returns a proposal/jobId, never mutates
  6. confirm path: claim pending row atomically; rich_confirm requires ack → else 'confirm_required'
  7. dispatch to executor / enqueue job; never throw → 'handler_error' on failure
  8. always write ai_action_audit (arg KEYS only, payload.source='mcp')
```

Invariant preserved: a tool is exposed for action **only** if its group flag is on AND its `riskTier`
gating is satisfied. Default-off, per-group, role-scoped, audited.

## 4. Tool group A — Generation (ship first)

Reuse the existing endpoints/queues; the MCP tools are thin proxies through the internal layer, same
as Phase 1. Per-client **budget caps and compliance gates already exist server-side and are
non-negotiable** — MCP calls go through them unchanged.

| MCP tool | Backs onto | Sync/async | Gates already in place | Phase-2 work |
|---|---|---|---|---|
| `generate_voiceover` | `audio/voiceover.post` | **sync** (fast TTS) | text sanitize, channel LUFS | expose as-is; cap text len; audit |
| `start_music_generation` + `get_generation_status` | `audio/music/generate` + `music/status/[id]` | **async** (`MUSIC_QUEUE`) | artist-blocklist 422, idempotency, no-double-bill | wrap existing status endpoint as the poll tool |
| `start_video_generation` + `get_generation_status` | `video/generation/jobs` + `jobs/[id]` | **async** (`VIDEO_GENERATION_QUEUE`) | **atomic per-tenant monthly cap** (`budget.ts`), compliance gate (`blocked`), idempotency | surface `blocked`/`402 cap_exceeded` as clean tool errors |
| `render_banner` | `banner-studio/export-video` | **sync, in-request ffmpeg** ⚠️ | none | **gap — must async-ify (see §7) before MCP exposure** |

Notes:
- Voiceover & video are `clientId`/`projectId`-scoped — the MCP tool must require and validate those,
  and re-derive the user's role server-side (never trust the host).
- Generation tools are `mutates: true` (they bill + persist assets) but are **not** "writes to
  platform state" — treat them as their own group with their own enable flag
  (`MCP_GEN_TOOLS_ENABLED`), so generation can go live independently of `propose_*` writes.

## 5. Tool group B — Writes (ship second, separate flag)

Map the existing `propose_*` / action tools to the two-step pattern. The executor registry already
does the real mutation through existing guardrail chains (e.g. `propose_budget_change` only *stages*
into the spend approve→execute chain — it does not apply directly).

| MCP tool pair | riskTier | Existing executor |
|---|---|---|
| `propose_task` / `confirm_task` | confirm | create_task |
| `propose_schedule_post` / `confirm_…` | confirm | schedule_social_post |
| `propose_quote` / `confirm_…` | rich_confirm | quote |
| `propose_budget_change` / `confirm_…` | **rich_confirm** | spend PLAN endpoint |
| `propose_eom_generate` / `confirm_…` | **rich_confirm** | eom_generate |
| `propose_expense_*`, `propose_proof_status`, `propose_opportunity`, `log_crm_activity` | confirm | existing executors |

`remember` / team-memory curation can ship in group B at `confirm` (low risk).

## 6. New internal surface (the only net-new backend)

Phase 1 added `/api/internal/mcp/{tools,call,exchange}`. Phase 2 adds, behind the same
`x-mcp-secret` + group flags:

- `POST /api/internal/mcp/action` — propose: validate, run pre-flight gates, persist pending row, or
  for generation enqueue + return jobId. Returns proposal/job summary.
- `POST /api/internal/mcp/confirm` — claim + execute via executor registry.
- `POST /api/internal/mcp/job-status` — proxy the per-domain status (music/video) behind one shape.

**Pending-action keying:** `ai_pending_actions.conversation_id` is chat-scoped; MCP has no
conversation. Add a nullable `mcp_session_id` (or `source='mcp'` + actor) so a proposal is claimable
only by the same MCP user/session that created it, with the same 30-min TTL. Small additive migration.

## 7. Gaps to close before each group ships

1. **`render_banner` is synchronous ffmpeg in the request** — will exceed timeouts and can't poll.
   Must move to a queue (`VIDEO_RENDER_QUEUE` consumer already exists) + status row before MCP
   exposure. Until then, exclude banner from group A.
2. **Voiceover has no job row / status path** (it's sync). Fine to expose sync, but if we want
   consistency or longer scripts, add the async path later.
3. **No generic job-status table** — each domain owns its lifecycle. `get_generation_status` must
   route by job-type prefix; acceptable, but document it.
4. **No per-user/per-session action rate limits** on the confirm path — add a simple quota for MCP
   actors (external hosts can loop).
5. **Compliance `blocked` has no appeal flow** — surface as a terminal, explained tool error; admin
   override stays in-app.

## 8. Security & invariants (unchanged posture)

- Reuse-app-identity OAuth from Phase 1; role re-derived from `team_members` per call.
- Every action/generation call → `ai_action_audit`, `payload.source='mcp'`, arg **keys** only.
- Budget caps & compliance enforced server-side, before enqueue, inside the existing advisory-lock.
- Per-group enable flags default **off**; flipping any is an operator decision, per group, with
  sign-off. Generation and writes are independently gated.
- The Phase-1 read path and its `mutates` hard-block are untouched.

## 9. Suggested phasing

- **2a — Generation, low-risk subset:** `generate_voiceover` (sync) + `start_music_generation`/status.
  No platform-state writes, existing gates, fastest path to "create" over MCP. Flag `MCP_GEN_TOOLS_ENABLED`.
- **2b — Video generation:** add `start_video_generation`/status once cap + compliance error surfacing
  is verified live. Same flag or a sub-flag.
- **2c — Writes:** the `propose_*`/`confirm_*` pairs behind `MCP_WRITE_TOOLS_ENABLED`, starting with
  `confirm`-tier (task, schedule_post), then `rich_confirm` (budget, quote, EOM).
- **2d — Banner render** after async-ification (§7.1).

## 10. Open decisions for sign-off

1. Ship generation (2a) before any writes? (Recommended: yes.)
2. Elicitation now, or two-step propose/confirm now + elicitation later where supported? (Recommended:
   two-step now.)
3. Per-group flags vs. one Phase-2 flag? (Recommended: per-group — generation ≠ writes in risk.)
4. Do external hosts get `rich_confirm` actions at all in 2c, or are budget/EOM/e-sign held to in-app
   only for now? (Conservative default: hold `rich_confirm` to in-app until 2c is proven.)
5. MCP-session pending-action keying: extend `ai_pending_actions` vs. a dedicated table.

## 11. Out of scope

Client/portal MCP server (`portalRegistry`, separate auth surface) — its own phase. Consuming
external MCP servers (us as client) — separate initiative; only for capabilities we don't own.
