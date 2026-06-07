# Handoff — AI Tool-Calling (Agentic Layer), Slice 1 — BUILD COMPLETE

**Date:** 2026-06-07
**Status:** **BUILT, code-reviewed, tested, type-clean. PR #120 open. Dormant behind `AI_TOOLS_ENABLED=false`. NOT merged.**
**Branch:** `feat/ai-tool-calling-slice1` · **Worktree:** `.worktrees/ai-tool-calling` (full `pnpm install`, kept alive for PR iteration)
**PR:** https://github.com/adme-dev/dashboard/pull/120 (→ `main`, merges cleanly)

> This supersedes the pre-build handoff `2026-06-07-ai-tool-calling-handoff.md` (which said "not built"). Read this one to finish the slice.

---

## TL;DR

The gated tool-calling loop is fully built and wired into `processUserMessage` (chat + widget + voice). 9 read tools + `create_task` (Option B propose→confirm→execute). **85 ai tests green, 0 new type errors.** Everything is dormant behind `AI_TOOLS_ENABLED=false`. What remains is **operator/rollout work**, not building: merge the PR, run the local Groq bake-off, validate the KB ACL, UAT, deploy, then flip the flag with sign-off.

---

## What's done (23 commits, 9 phases)

| Area | Files |
|---|---|
| Providers + flag | `server/utils/claudeClient.ts` (`resolveModel`, gateway providers), `nuxt.config.ts`, `.env.example` |
| Migration 171 (LIVE on Neon) | `server/database/migrations/171-ai-tool-calling.sql` — `ai_messages.tool_calls` + `ai_pending_actions` (UUID user_id) |
| Core | `server/utils/ai/{spotlight,toolContext,toolRegistry,toolLoop,personas,gate,pendingActions}.ts` |
| Tools | `server/utils/ai/tools/{finance,adspend,tasks,projects,anomalies,clients,knowledge,social,briefs,createTask,index}.ts` |
| Write path | `server/api/agency/ai/chat/conversations/[id]/confirm-action.post.ts`, `app/components/ai/AiProposedActionCard.vue` |
| Engine wiring | `server/utils/aiChatEngine.ts` (gate + loop + persist tool_calls + return proposedAction), `app/composables/useAiChat.ts`, `app/pages/agency/ai/chat.vue` (card + Consulted chip), `voice.post.ts`, `[id].get.ts` |
| Evals | `evals/ai-tools/` (promptfooconfig + injection + Zod-generated tools.json), `scripts/export-ai-tools.ts`, `pnpm eval:ai*` |
| Tests | `test/ai/**` (85 tests) |

**Locked decisions:** AI SDK v6 harness; **Option 2 model = Groq `gpt-oss-120b` + Kimi K2 fallback**, Anthropic dormant; Option B write path; two-layer RBAC + row scoping; spotlighting + Rule-of-Two.

**SDK corrections (verified vs installed `ai@6.0.197` — the old handoff's "critical corrections" were BACKWARDS):** `stepCountIs(5)` not `isStepCount`; v6 HITL is tool-level `needsApproval` (no `toolApproval`) but we use NEITHER (Option B = execute-that-proposes; proposal read from the tool RESULT); `MockLanguageModelV3` not V2. Added `roleHasPermission` to `permissions.ts` (none existed). The plan has a full "Implementation corrections" block.

**Code review (high effort) fixed:** confirm-card UI wiring (was unreachable); loop fallback fresh-deadline (was reusing aborted signal); no-revert-after-successful-create (dup-task fix); shared `escapeLike` (backslash); spotlight neutralizes forged/bare markers; anomalies severity order; social requires explicit client; clients margin subqueries scoped. **Refuted:** create_task "escalation" (matches real `/api/agency/tasks` auth); per-client scoping (agency staff manage ALL clients — documented precedent).

---

## What's LEFT (to-do list — tasks #12–#19)

Ordered; dependency chain noted.

1. **#12 Merge PR #120** → then remove the worktree.
2. **#13 Bake-off (local, blocks #17):** in the worktree `.env` add `GROQ_API_KEY` (+`DATABASE_URL`) from the main checkout `.env`, then `pnpm eval:ai:export && pnpm eval:ai` (gpt-oss-120b vs Kimi K2 vs gpt-oss-20b) + `pnpm eval:ai:injection`. Lock `AI_LOOP_MODEL`/`AI_LOOP_FALLBACK_MODEL` to winner/runner-up.
3. **#14 KB ACL (blocks #17):** `tools/knowledge.ts` `defaultCanSee` is **fail-open** for docs lacking `visibility`/`ownerId`, and `ctx.clientScope` is never set on the staff chat. Confirm how KB docs are upserted to Vectorize + make it fail-closed for sensitive docs, OR confirm all KB is staff-shareable.
4. **#15 Local UAT (blocks #17):** flag on → finance question fires + cites live numbers; non-FINANCE role sees no finance tools; create_task → confirm card → task + `executed` row + no double-create; one voice round-trip. (Needs a connected Xero org for real finance numbers — none currently.)
5. **#16 Deploy (needs #12):** from the clean `.worktrees/deploy-prod` at origin/main; keep flag false; mig 171 already live.
6. **#17 Flip `AI_TOOLS_ENABLED=true` in prod — ONLY with explicit sign-off** (needs #13/#14/#15/#16). Watch OTel + cost.
7. **#18 Follow-up polish (non-blocking):** rehydrate open proposals on reload; reuse refactor (`resolveByName`/`capWithMore`); briefs→shared escapeLike; reconcile `MANAGER_ROLES` vs `PERMISSIONS.MANAGEMENT`.
8. **#19 Slice 1.5:** named personas (Finance/Marketing/Sales/Account = config, zero engine rework) + persona picker; marketing-page sync when live; future Workflow Oracle evolves `aiAgentRunner.ts`.

---

## How to resume

1. Read this file + the plan's "Implementation corrections" block (`docs/superpowers/plans/2026-06-07-ai-tool-calling-slice1.md`) + spec.
2. Work in the existing worktree `.worktrees/ai-tool-calling` (still on the branch) OR a fresh checkout after merge.
3. `pnpm exec vitest run test/ai/` (85 green) to confirm a clean base.
4. Pick from #12–#19. The flag stays **false** until #17.

## Gotchas / environment

- Typecheck OOMs at default heap: `NODE_OPTIONS=--max-old-space-size=16384 pnpm exec nuxt typecheck`. Project baseline is **~1264 pre-existing errors** (NOT mine) — diff against `/tmp/aitc-typecheck-*.txt` or grep for `server/utils/ai/` to isolate. The 2 `aiChatEngine.ts(490)` GroqModel errors are pre-existing (the existing `generateGroqInsight({model: selectedModel})` line, shifted).
- Tests: `pnpm exec vitest run <path>` (bare `vitest` = watch). `~~/` alias resolves in tests (postinstall ran `nuxt prepare`).
- Deploy builds the WORKING TREE → deploy only from a clean worktree at the target commit; never disturb the main checkout's social-publishing WIP.
- Push needs the `adme-dev` gh account (active) — Paul008 gets 403.

## Guardrails (carry forward)

- **NEVER flip `AI_TOOLS_ENABLED` in prod or trigger a live `create_task` execution without explicit user go-ahead.**
- Rule of Two: no new tool may add an unreviewed external-comm / state-change path while untrusted input + sensitive data coexist (PR-review checklist).
- Row scoping is tool-layer-injected (`ctx.userId`), never model-supplied; every read tool needs a cross-tenant leak test.
