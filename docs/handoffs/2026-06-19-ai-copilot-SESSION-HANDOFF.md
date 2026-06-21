# Detailed Session Handoff — AI Co-pilot Program

**Written:** 2026-06-19 (end of build session)
**Branch:** `feat/ai-copilot-phase0` (NOT merged, NOT deployed)
**Read order for a new session:** this doc → `docs/handoffs/2026-06-19-ai-copilot-build-loop.md` (backlog + loop protocol) → the spec for whatever area you touch.

> Purpose: a fresh Claude/dev session can read this one file and fully reconstruct context, then continue the build loop without re-deriving anything.

---

## 0. TL;DR

Building a **personal AI co-pilot for every team member** (and a scoped one for clients) by **reusing** the existing agentic tool-calling layer. This session: designed the whole program (PRD + 7 specs + ADR), then **built and committed Phase-0 foundations** — the complete write/approval/audit spine and the memory data+scoring layer. **188/188 AI tests green. Nothing deployed, no flags flipped, all writes dormant.** Two additive migrations applied to prod Neon. Next: finish memory (WS-A.4→A.8), then skill-packs.

## 1. What this program is

Every employee gets a co-pilot that knows them (memory), understands the platform, and executes work **within their RBAC permissions** via propose→confirm→audit. One engine, per-role "skill-packs" (persona + RBAC-intersected tools), one write/approval/audit spine, across staff chat + virtual office + (isolated) client portal. A "traffic controller" routes/decomposes cross-department requests. Full vision + citations: `docs/prd/personal-ai-copilot.md`.

**Design docs (all in `docs/specs/ai-copilot-*`):** memory-architecture, phase-0-plan, media-buyer-skillpack, virtual-office-integration, portal-agent, traffic-controller, command-center-knowledge, mcp-interop-adr.

## 2. Branch state — every commit

```
214c2e47 feat(ai): memory retrieval scoring (WS-A.3)
b41a81d2 feat(ai): memory store + types (WS-A.2)
5318e414 feat(ai): ai_user_memory table (WS-A.1, mig 180)
4f55589d feat(ai): write ai_action_audit rows in confirm path (WS-C.2)
cc4d356a feat(ai): ai_action_audit ledger (WS-C.1, mig 181)
2335cc08 docs: getting-started handoff + loop progress
44e5160c docs: MCP ADR + build-loop handoff + locked decisions
b6682061 feat(ai): tool-executor registry + generic confirm (WS-B)
b996d47f docs: PRD + 7 specs
```
(plus an uncommitted memory-spec edit resolving the residency question — commit it.)

## 3. What's built, file by file

**The write/approval/audit spine (DONE, fully wired):**
- `server/utils/ai/executors/types.ts` — `ActionExecutor` { toolName, label, riskTier, execute(payload,ctx)→{resultRef,summary} }.
- `server/utils/ai/executors/createTask.ts` — create_task executor; `makeCreateTaskExecutor(post)` injects the POST for tests.
- `server/utils/ai/executors/index.ts` — `executors` registry + `getExecutor(toolName)`.
- `server/utils/ai/toolContext.ts` — added `RiskTier = 'auto'|'confirm'|'rich_confirm'`.
- `server/utils/ai/toolRegistry.ts` — added `riskTier?` field on `AiTool` + `effectiveRiskTier(t)` (read→auto, mutates→confirm, explicit wins).
- `server/api/agency/ai/chat/conversations/[id]/confirm-action.post.ts` — **now generic**: resolves the executor by `tool_name` at atomic-claim time, posts the executor's `summary`, writes an audit row. `executeProposal`/`PendingActionDb` signatures UNCHANGED (tests pin them).
- `server/utils/ai/audit.ts` — `auditParams` (pure) + `recordAudit` (fail-safe, injected writer).
- mig **181** `ai_action_audit` (applied to prod).

**Memory layer (data + scoring DONE; vector/render/capture/wiring TODO):**
- mig **180** `ai_user_memory` (applied to prod) — 3 scopes (semantic/episodic/procedural), `UNIQUE(user_id,mem_type,content)`, user-scoped.
- `server/utils/ai/memory/types.ts` — `MemType/MemScope/MemSource`, `UserMemory`, `UpsertMemoryInput`, `ScoredMemory`.
- `server/utils/ai/memory/store.ts` — injected `MemoryDb`; `upsertMemory` (reinforce-on-conflict, `REINFORCE_STEP=0.1`), `getMemoriesByIds`, `listRecentMemories`, `stampUsed`, `deleteUserMemory`.
- `server/utils/ai/memory/retrieve.ts` — PURE: `recency` (half-life 30d), `scoreMemory` (vector×recency×TYPE_WEIGHT×salience; weights semantic .6/episodic .3/procedural .1), `estimateTokens`, `selectTopMemories` (top-5/≤200tok greedy with skip-over-budget).

**Tests added (all green):** `test/ai/executors.test.ts` (7), `test/ai/audit.test.ts` (5), `test/ai/memoryStore.test.ts` (9), `test/ai/memoryRetrieve.test.ts` (7). Regression gates untouched: `pendingActions`, `confirmAction`, `toolRegistry`, `toolLoop`. **Full `test/ai/` = 188/188.**

## 4. Locked decisions (do not re-litigate)

- **One engine, many skill-packs**; multi-agent supervisor only at Phase 3.
- **One write/approval/audit spine** — `ai_pending_actions` → executor registry → `ai_action_audit`. The office assistant's jobs and the portal converge onto this; no second approval/audit system.
- **Memory ≠ KB** — memory auto-writes (private, per-user); the shared KB is propose→review→publish (`is_published`), never auto-published.
- **Config narrows, never grants** — self-service config is intersected with RBAC (validated against OpenAI Workspace Agents; permission-inheritance = our RBAC ceiling).
- **MCP** — native AI SDK tool-calling internally; MCP only as a future *expose* adapter over the registry (ADR). No MCP infra in this loop.
- **Portal** — Tier 1 read-only first; first write `respond_to_approval`; agency-managed per-client app assignment; v1 neutral "Portal Assistant".
- **Memory residency — RESOLVED 2026-06-19:** per-user memory lives in the existing **Neon + Vectorize** (no separate residency constraint). Distiller cleared to BUILD; flipping `AI_MEMORY_DISTILL_ENABLED` in prod is still a separate go-ahead.

## 5. Next tasks (exact, in order) — resume here

Backlog lives in the build-loop doc §5. Immediate queue:

- **WS-A.4** — add an optional metadata `filter` param to `aiVectorize.searchSimilar` (additive; pass `{ userId, scope, memType }` through to `vectorize.query`). Extract a pure `resolveSearchArgs(...)` to keep arg-parsing testable (the fn is overloaded: `(query,topK?)` and `(event,query,topK?)` — add `filter` as a trailing optional in both forms). Test the parser; don't break existing callers.
- **WS-A.5** — `memory/render.ts` (pure): `ScoredMemory[]` → a ≤200-token "What I remember about you" system-prompt block; empty → ''. Test budget + ordering.
- **WS-A.6** — `tools/remember.ts`: explicit-capture tool (NOT `mutates` — low-risk, write directly via `upsertMemory` with `source:'explicit'`); register in `tools/index.ts`. Test.
- **WS-A.7** — `memory/distill.ts` (PURE prompt + tolerant parser + injected `gpt-oss-20b` call): after a turn, propose ≤3 deduped memories; behind `AI_MEMORY_DISTILL_ENABLED` (ships OFF). Mirror the `enrich.ts` pattern. Test parser tolerance + max-3 + dedup. **Cleared to build (residency resolved); do NOT enable the flag.**
- **WS-A.8** — wire retrieve+inject (and async fire-and-forget distill) into `server/utils/aiChatEngine.ts` where it already loads history + `getRelevantPatterns()`. Add a **cross-user isolation test** (a user never receives another user's memory). This touches the LIVE chat path — only activates under existing `AI_TOOLS_ENABLED`.

Then **Phase 1** (read-everywhere skill-packs: `media_buyer` persona + `rolePersona.ts` + `get_campaign_breakdown`/`get_budget_health`), then Phase 2 writes, etc. (build-loop §5).

## 6. How to work (conventions + commands)

- **Stay on `feat/ai-copilot-phase0`.** Stage ONLY co-pilot files — the working tree carries unrelated media/audio/video WIP; never commit it.
- **TDD pure cores first** (scoring/parse/map are I/O-free); inject DB/$fetch (mirror `executors/createTask.ts`, `memory/store.ts`).
- **Server imports `~~/server/utils/*`** (never `~/`). Types in `app/types/index.ts` (not `.d.ts`).
- **Migrations** additive `IF NOT EXISTS`, next free number **182** (KB provenance), then 183 (agent configs). Apply: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`.
- **Test:** `pnpm exec vitest run test/ai/` (fast gate) · `pnpm test:run` (broad). Zero NEW type errors (~60 pre-existing from `.d.ts`).
- **Commit** atomically, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Before any merge: `/code-review high`.

## 7. Hard gates — STOP for human sign-off (never auto-proceed)

1. Flipping any write flag (`AI_TOOLS_ENABLED` to a new surface, `AI_MEMORY_DISTILL_ENABLED`, budget-write flags, `AI_CONTROLLER_L2_ENABLED`).
2. Any production deploy (`pnpm deploy:production`, from clean `.worktrees/deploy-prod` only).
3. Live external writes (budget changes, Xero pushes, sends).
4. Merge to `main` / opening a PR.
5. Schema-destructive change (none expected; all migrations additive).

If a task needs a gate, mark it blocked, write what's needed, move to the next unblocked task.

## 8. Codebase gotchas (learned this session)

- The confirm endpoint was the ONLY thing blocking new write tools; it's now generic (WS-B). Adding a write = one executor file + register it.
- `executeProposal`/`PendingActionDb` are pinned by tests — keep signatures stable; `createTask` is the generic "mutation slot" name (don't rename).
- `aiVectorize.searchSimilar` does NOT pass a metadata filter yet (WS-A.4 adds it) and has messy `(event|string,...)` overloads — extract a pure parser.
- The shared Vectorize index is mixed-sensitivity (KB + entities + memory) — memory recall MUST filter by `{userId}` metadata + the KB read stays fail-closed to `type==='knowledge_article'`.
- There's a pre-existing `MemoryCache` (KV request cache) — unrelated to `ai/memory/`; don't conflate.
- Two migrations (180, 181) already applied to prod Neon — do not re-create; next is 182.

## 9. Resume the loop (entry prompt)

> Read `docs/handoffs/2026-06-19-ai-copilot-SESSION-HANDOFF.md` then `…-build-loop.md`. Pick the top unchecked, unblocked task (next: WS-A.4). Build per the loop protocol (TDD, injected deps, additive migration if needed), verify (`pnpm exec vitest run test/ai/`, zero new type errors), commit staging only co-pilot files, tick the box with the SHA. Stop at any hard gate. Repeat.
