# Handoff — AI Assistant Tool-Calling (Agentic Layer), Slice 1

**Date:** 2026-06-07
**Status:** Brainstorm → spec → implementation plan **COMPLETE**. Nothing built yet. Ready to execute Phase 0.
**Branch:** `main` (all artifacts committed; repo also carries unrelated social-publishing WIP — **do not disturb it**).

---

## TL;DR

We designed (not yet built) a **gated tool-calling loop** for the existing AI chat assistant so it can query live agency data (9 read tools) + propose one guarded action (`create_task`), inheriting to text chat, the widget, and voice. The **spec and implementation plan are written, committed, and self-reviewed.** Next session: execute the plan (Phase 0 first), ideally in an isolated worktree.

**Read these two files first:**
- Spec: `docs/superpowers/specs/2026-06-07-ai-tool-calling-design.md`
- Plan: `docs/superpowers/plans/2026-06-07-ai-tool-calling-slice1.md`

**Commits (newest first):**
- `0c23b587` implementation plan
- `45b42017` persona-readiness added to spec
- `2ac01cee` harness research folded into spec
- `2b7043a8` initial spec

---

## What the slice is (locked decisions)

- **Harness:** Vercel **AI SDK v6** (`ai@^6`, latest 6.0.197), `@ai-sdk/anthropic` + `@ai-sdk/groq`. Wrapped into the existing `server/utils/aiChatEngine.ts` `processUserMessage` (the shared engine for chat + widget + voice).
- **Loop model:** **Claude Sonnet 4.6** default via Cloudflare AI Gateway `/anthropic`, with **gateway fallback → Groq `gpt-oss-120b`**. Final pick is gated on a **promptfoo bake-off** (Sonnet 4.6 vs Kimi K2 vs gpt-oss-120b on our real tools + injection suite) — Plan Phase 8.
- **Gate model:** rule-based on the `intent` already computed by `retrieveContext()` (≈ free); `gpt-oss-20b` only for ambiguous cases. Gate is **narrowing-only** (never grants capability).
- **Tools (9 read + 1 write):** `get_finance_snapshot`, `get_adspend_pacing`, `get_tasks`, `get_project_status`, `get_open_anomalies`, `get_client_overview`, `search_knowledge`, `get_social_performance`, `get_briefs`, `create_task`. Sources mapped to real files in spec §6.
- **Write path = Option B (propose→confirm→execute):** model only *proposes*; a row is persisted to `ai_pending_actions`; a **separate Nitro endpoint** executes on user confirm (no message rehydration, no 2nd model call). NOT the SDK's native two-call resume.
- **RBAC:** pre-send tool filtering (`hasPermission` from `permissions.ts`) + handler-time re-check + **tool-layer-injected row scoping** (`ctx.userId`/`clientId`, non-optional) + cross-tenant leak tests.
- **Injection defense:** spotlight/datamark all untrusted tool output (`search_knowledge`, `get_social_performance`, `get_briefs`, anomalies); **Rule-of-Two hard constraint** (no future tool may add an unreviewed external-comm/state-change path while untrusted input + sensitive data coexist).
- **Persona-ready:** the loop takes an optional `persona` (preamble + tool allowlist ∩ RBAC). Ship ONE generalist "Agency Assistant" now; named personas (Finance/Marketing/Sales/Account) are **slice 1.5 config** — zero engine rework.
- **Audit/obs:** `ai_messages.tool_calls` JSONB column + append-only `ai_pending_actions` table (migration in Plan Phase 1); OTel GenAI spans; per-turn cost budget.
- **Flag:** `AI_TOOLS_ENABLED` (off by default). **Never flip in prod or trigger a live `create_task` execution without explicit user go-ahead.**

---

## CRITICAL corrections discovered during research (already in the spec)

1. **AI SDK v6: tool-level `needsApproval` is DEPRECATED** → use call-level **`toolApproval`** on `generateText`. (The `cloudflare/agents-starter` repo still shows the legacy `needsApproval` — don't copy that part.)
2. **The SDK's approval flow is a two-*model*-call message-array flow, not a two-HTTP-endpoint bridge.** That's why we use **Option B** (direct-execute via separate endpoint) — matches Mastra `runId`→load→execute.
3. **Use `isStepCount(5)`** (v6 canonical), not `stepCountIs(5)` (older spelling, still works).

---

## OPEN ITEMS (do these to resume)

### 1. Pick execution mode (asked, not answered)
- **Subagent-driven** (recommended): fresh subagent per task + review between tasks. Use `superpowers:subagent-driven-development`.
- **Inline**: batch with checkpoints. Use `superpowers:executing-plans`.
- ⚠️ Run in an **isolated git worktree** (`git worktree add --detach <dir> origin/main`, then give it its own `node_modules` via `pnpm install` — NOT a symlink; see project memory `subagent-driven-execution-notes` + `dev-server-emfile-worktree`). The shared tree has WIP and other sessions switch branches.

### 2. Build-time gateway verifications (Plan Phase 0.3 / 9.2) — NOT yet confirmed
- Exact **CF AI Gateway `baseURL` shape** for use with the AI SDK: `https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/{provider}` — and whether a **`cf-aig-authorization`** header is required. CF documents the `createAiGateway()` wrapper, not raw `baseURL` — verify before relying on the raw-baseURL approach (fallback: use the `ai-gateway-provider` npm package).
- Confirm **`gpt-oss-120b` is enabled** on the gateway's Groq route.
- The existing `AI_GATEWAY_URL` env (used by `groqClient.ts:15`) gives the base. ⚠️ Note inconsistency: `groqClient.ts` uses the base directly; `action-plan.post.ts:543` appends `/perplexity-ai`. Normalize (the spec's `gatewayBase()` helper handles this).

### 3. Run the model bake-off (Plan Phase 8) before locking `AI_LOOP_MODEL`.

---

## Research artifacts (where the findings came from)

The **deep-research workflow FAILED** (harness bug: `subagent completed without calling StructuredOutput` — burned ~4.9M tokens, returned nothing). **Do not retry it verbatim.** Recovery that WORKED: free-text general-purpose agents + the Kimi browser for primary sources. Key outputs were folded into the spec:

- **Model data (spec §5):** live BFCL v4 (browser-verified) — Claude Sonnet-4-5 **73.24**, Haiku-4-5 **68.7**, Kimi K2 **59.06**, qwen3-32b **48.71**, llama-3.3-70b **31.9**; `gpt-oss-120b` not independently ranked. Pricing/throughput in the table. (Corrected an agent's secondhand errors — Kimi K2 *is* on BFCL; qwen3 v3≠v4.)
- **Best practices + plan critique (spec §9, §12):** spotlighting (Microsoft), Rule-of-Two (Meta/Willison), eval/injection-regression harness (was missing), tool-layer row scoping.
- **Competitive + gap scan (spec §15):** market converged on confirmation-before-write defaults, action logs, MCP-server exposure. Ranked future agent tools (get_client_profitability, check_resource_capacity, monitor_retainer_burn, flag_over_servicing, draft_sow_from_brief, forecast_revenue, score_account_health, route_for_approval). Platform gaps: resource/capacity planning, per-client profitability, retainers, proposals/SOW, approvals engine, forecasting, DAM.
- **OSS to study (spec §14):** `cloudflare/agents-starter` (MIT, our stack — clone first), AI SDK v6 docs, `promptfoo` (MIT TS — adopt for evals), `tldrsec/prompt-injection-defenses`, `mastra`/`langgraphjs` (suspend/resume). Code-level patterns in spec §14b.
- **Harness alternatives (spec §3a):** **Flue** (`withastro/flue`) — credible full harness but new; **re-evaluate before the proactive/multi-agent tier**, not now. **Paperclip** (`paperclipai/paperclip`) — "company of agents" control plane; reference for the future autonomous-agent-fleet (heartbeats, governance, budgets). **arcads-claude-code** — marketing skill-pack pattern for the future Marketing persona.

Full agent transcripts (if needed) are under the session's `subagents/` dirs, but everything load-bearing is in the spec.

---

## Codebase anchors (verified this session)

- Chat engine: `server/utils/aiChatEngine.ts` — `processUserMessage` at `:330`; `selectModel` at `:14` (detects `action_request` and does nothing — that's the gap); history load `:342`; assistant INSERT `:478`. `ChatResponse` type `:8`.
- Voice: `server/api/agency/ai/chat/conversations/[id]/voice.post.ts` — STT(Whisper)→`processUserMessage`→TTS(MeloTTS); inherits tools for free.
- Claude client: `server/utils/claudeClient.ts` — currently DIRECT to Anthropic (no gateway); Phase 0.3 adds gateway-routed AI SDK providers + `resolveModel`.
- Groq client: `server/utils/groqClient.ts:14` — already routes via `AI_GATEWAY_URL`; model catalog comments already call `gpt-oss-120b` "best JSON adherence + tool use".
- Permissions: `server/utils/permissions.ts:5` `PERMISSIONS` (FINANCE/CLIENTS/MANAGEMENT/…) + `hasPermission(role, category)`. Auth: `server/utils/auth.ts` `requireAuth`/`requireRole:217`/`requireWriteAccess:233`.
- DB: `server/utils/db.ts` — `queryRows/queryOne/execute/transaction`. Tables: `ai_conversations`, `ai_messages` (per-user). Server imports use `~~/`.
- Tool sources (spec §6): cashflow.get.ts, xero/invoices.get.ts, advisorMetrics.ts, anomalyDetection/analysers/adspendHealth.ts, spend/summary.get.ts + alerts.get.ts, tasks/projects tables, anomalies table, agency_clients + briefs, aiVectorize.searchSimilar, socialReporting/aggregate.ts + reporting/overview.get.ts, briefs/index.get.ts.

---

## Gotchas / environment
- **Local vs prod build split:** local env has NO `ANTHROPIC_API_KEY` / `AI_GATEWAY_URL` → the gateway + Sonnet path are **prod-only**. Plan **Phases 0–7 are fully buildable + unit-testable locally** (tests inject/mock the model — the plan is already designed this way). **Phase 8** (live model bake-off) + **Phase 9** (browser/voice verification) need operator keys + the CF dashboard → build them, then hand the final live steps to the operator.
- Typecheck OOMs at default heap: `NODE_OPTIONS=--max-old-space-size=16384 pnpm exec nuxt typecheck` (~60 pre-existing baseline errors are expected).
- Tests: `pnpm exec vitest run <path>` (bare `vitest` = watch).
- Migrations: run immediately — `export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-); psql "$DATABASE_URL" -f <file>`.
- Deploy from a clean worktree at `origin/main` (deploy builds the WORKING TREE).
- Kimi WebBridge daemon is up (`~/.kimi-webbridge/bin/kimi-webbridge status`) — used for primary-source verification this session.

---

## Suggested first move next session
1. Read the spec + plan.
2. Create the worktree; `pnpm install`.
3. Verify the 2 gateway unknowns (Open Item 2) — via CF dashboard or browser.
4. Confirm execution mode (subagent-driven recommended) and start Plan **Phase 0**.
5. Keep `AI_TOOLS_ENABLED=false`; never trigger a live `create_task` or flip the flag in prod without explicit go-ahead.
