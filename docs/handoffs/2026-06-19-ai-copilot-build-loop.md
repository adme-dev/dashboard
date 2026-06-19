# Handoff: AI Co-pilot Build Loop (endless-goal work environment)

**Created:** 2026-06-19
**Branch:** `feat/ai-copilot-phase0`
**Goal:** Ship the Personal AI Co-pilot program — one engine, per-role skill-packs, RBAC ceiling, one write/approval/audit spine — across staff chat, the virtual office, and the client portal.
**How to use this doc:** it is the loop's source of truth. Each iteration: read §6 state → pick the top unblocked task in §5 → build it per §4 → verify per §7 → commit → tick the box in §5 → repeat. Stop at any §8 gate.

---

## 1. North star

Every team member (and, scoped, every client) gets a co-pilot that knows them, understands the platform, and can execute work within their permissions. Built by reusing the existing agentic layer — **not** a rewrite. Full design: [`docs/prd/personal-ai-copilot.md`](../prd/personal-ai-copilot.md) + the companion specs in [`docs/specs/ai-copilot-*`](../specs/).

## 2. Spec index (read before touching an area)

- PRD: `docs/prd/personal-ai-copilot.md`
- Memory: `docs/specs/ai-copilot-memory-architecture.md`
- Phase 0 plan: `docs/specs/ai-copilot-phase-0-plan.md`
- Media Buyer skill-pack: `docs/specs/ai-copilot-media-buyer-skillpack.md`
- Virtual office: `docs/specs/ai-copilot-virtual-office-integration.md`
- Client portal: `docs/specs/ai-copilot-portal-agent.md`
- Traffic controller: `docs/specs/ai-copilot-traffic-controller.md`
- Command center + knowledge + self-config: `docs/specs/ai-copilot-command-center-knowledge.md`
- MCP interop ADR: `docs/specs/ai-copilot-mcp-interop-adr.md`

## 3. Locked decisions (do not re-litigate in the loop)

- **One engine, many skill-packs** — single-agent + RBAC-intersected skill-packs; multi-agent supervisor only at Phase 3 (traffic controller).
- **One write/approval/audit spine** — `ai_pending_actions` (propose→confirm) + the executor registry (WS-B, DONE) + `ai_action_audit` (WS-C). The office assistant's jobs and the portal converge onto this; no second approval/audit system.
- **Memory ≠ KB** — personal memory auto-writes (`ai_user_memory`); the shared agency KB is propose→review→publish only (`is_published` gate). Never auto-publish to the KB.
- **Config narrows, never grants** — self-service configuration is intersected with RBAC; it can only subtract capability.
- **Portal:** Tier 1 read-only first; first write = `respond_to_approval`; app-assignment is agency-managed per client; v1 branding = neutral "Portal Assistant".
- **MCP:** native AI SDK tool-calling internally; MCP is a future *expose* adapter only (see ADR). Do not add MCP infra in this loop.

## 4. Loop protocol (one iteration)

1. **Pick** the top unchecked, unblocked task in §5 (respect `blocked-by`).
2. **Worktree/branch:** stay on `feat/ai-copilot-phase0`. (If a concurrent session is likely, use a git worktree off this branch.) Run `nuxt prepare` if vitest can't resolve `~~/` in a fresh checkout.
3. **TDD:** write the pure-core test first (scoring/parse/map logic is I/O-free by design). Inject side-effects (DB/$fetch) so handlers are unit-testable — mirror `executors/createTask.ts` and the tools' `deps` pattern.
4. **Implement** to green. Match surrounding style; server imports use `~~/server/utils/*` (never `~/`).
5. **Migrations** (if any): additive, `IF NOT EXISTS`; apply against `.env` `DATABASE_URL` per CLAUDE.md. Next free number: **180** (memory), then 181 (audit), 182 (KB provenance), 183 (agent configs).
6. **Verify** per §7. All green + zero new type errors.
7. **Commit** atomically with a clear message + the Co-Authored-By trailer. **Stage only co-pilot files** — never the unrelated media/audio/video WIP in the working tree.
8. **Tick** the §5 box, note the commit SHA, and loop.

## 5. Ordered backlog (the work queue)

### Phase 0 — Foundations
- [x] **WS-B** executor registry + generic confirm dispatch + `riskTier`/`effectiveRiskTier` — DONE (`b6682061`, 31/31 AI tests green).
- [ ] **WS-C.1** mig 181 `ai_action_audit` (ledger) — apply. *(spec: phase-0 §WS-C)*
- [ ] **WS-C.2** write an audit row in the executor/confirm path (proposer, confirmer, tool, risk_tier, result_ref, outcome). Test. *blocked-by: WS-C.1*
- [ ] **WS-A.1** mig 180 `ai_user_memory` — apply. *(spec: memory-architecture §3)*
- [ ] **WS-A.2** `memory/{types,store}.ts` (injected db) + `store.test.ts`. *blocked-by: WS-A.1*
- [ ] **WS-A.3** `memory/retrieve.ts` pure scoring (recency × type_weight × salience, top-5/≤200tok) + test.
- [ ] **WS-A.4** `aiVectorize.searchSimilar` optional metadata `filter` (additive) + test.
- [ ] **WS-A.5** `memory/render.ts` (≤200-token block) + test.
- [ ] **WS-A.6** `tools/remember.ts` (explicit capture) + register + test.
- [ ] **WS-A.7** `memory/distill.ts` async inferred (gpt-oss-20b, behind `AI_MEMORY_DISTILL_ENABLED`) + test.
- [ ] **WS-A.8** wire retrieve+inject+distill into `aiChatEngine.ts` + cross-user isolation test. *blocked-by: WS-A.2..7*

### Phase 1 — Read-everywhere skill-packs (parallel, zero write risk)
- [ ] `media_buyer` persona + `rolePersona.ts` role→default-persona map + wire into `aiChatEngine`. *(media-buyer §3)*
- [ ] Read tools: `get_campaign_breakdown`, `get_budget_health` (gate `MEDIA_BUYING`) + tests.
- [ ] Finance/Account/Sales/Creative read tools as needed to give each role a day-1 assistant.

### Phase 2 — Execute, role by role (flag-gated, propose→confirm→audit)
- [ ] Media Buyer writes: `propose_budget_change` (rich_confirm, wraps `feat/budget-write-execution` apply-chain), `propose_budget_alert`, `propose_schedule_post` + executors + tests. *blocked-by: WS-C*
- [ ] Counter-model sanity check for `rich_confirm` + rich confirm-card UI. *(media-buyer §7)*

### Phase 3 — Orchestration & surfaces
- [ ] Traffic controller L1 auto-routing (intent+role → one skill-pack). *(traffic-controller §3)*
- [ ] Command Center v1 (Observe: proposals/audit/cost/memory) over existing data. *(command-center §4)*
- [ ] `propose_knowledge_article` + KB draft review/publish queue + mig 182. *(command-center §3)*
- [ ] Virtual office Mode A (dock co-pilot, room-scoped `ToolContext`). *blocked-by: ≥1 skill-pack*
- [ ] Portal Tier 1 (separate portal registry, `clientScope` REQUIRED, read tools, cross-tenant fuzz test). *(portal §3)*
- [ ] Self-service config: `ai_agent_configs` (mig 183) + "My Assistant" personalize + builder (gated). *(command-center §4a)*
- [ ] Traffic controller L2 supervisor (decompose→delegate→synthesize, behind `AI_CONTROLLER_L2_ENABLED`). *blocked-by: ≥2 skill-packs*

## 6. Current state

- On `feat/ai-copilot-phase0`. Commits: `b996d47f` (PRD + 7 specs), `b6682061` (WS-B). MCP ADR added (uncommitted at handoff time — commit it).
- **WS-B done & green:** `server/utils/ai/executors/{types,createTask,index}.ts`; `RiskTier` in `toolContext.ts`; `riskTier`+`effectiveRiskTier` in `toolRegistry.ts`; generic `confirm-action.post.ts`; `test/ai/executors.test.ts`. AI suite 31/31.
- **Nothing deployed. No flags flipped.** All co-pilot writes remain dormant.
- Working tree also carries **unrelated** media/audio/video WIP — do **not** stage it.

## 7. Verification (run before every commit)

```bash
# Targeted AI suite (fast regression gate)
pnpm exec vitest run test/ai/   # add the specific new test file too
# Whole suite when a change is broad
pnpm test:run
```
- Zero new TypeScript errors (project has ~60 pre-existing from `index.d.ts`; don't add more).
- For migrations: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`
- Before any merge: `/code-review high` (it has caught real bugs in prior phases).

## 8. Hard gates — STOP and get human sign-off (never auto-proceed)

1. **Flipping any write flag** — `AI_TOOLS_ENABLED` to a new prod surface, `AI_MEMORY_DISTILL_ENABLED`, budget-write flags, `AI_CONTROLLER_L2_ENABLED`, `SOCIAL_*`. The loop builds them **off**.
2. **Any production deploy** — `pnpm deploy:production` is human-only; deploy from a clean `.worktrees/deploy-prod`, never this build tree.
3. **Live external writes** — budget changes, Xero pushes, sends. Build behind propose→confirm; do not execute against real platforms in the loop.
4. **Merging to `main` / opening a PR** — human-gated.
5. **Memory residency** (memory-architecture §9.3 open question) — do not enable distillation in prod until answered.
6. **Schema-destructive change** — none expected; all migrations are additive.

If a task can't be completed without crossing a gate, **mark it blocked, write what's needed, and continue to the next unblocked task.**

## 9. Conventions (repo-specific)

- Server alias `~~/server/utils/*`; types in `app/types/index.ts` (not `.d.ts`).
- Nuxt UI v4 only for any UI; forms invoke the `frontend-design` skill first (per CLAUDE.md).
- Injected-deps + Zod + `ToolResult` for tools; `mutates: true` tools only PROPOSE.
- Keep `executeProposal`/`PendingActionDb` signatures stable (tests pin them).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Update marketing pages (features/*, MarketingNav) only at go-live, never in dormant build commits.

## 10. Loop entry prompt (suggested)

> Read `docs/handoffs/2026-06-19-ai-copilot-build-loop.md`. Pick the top unchecked, unblocked task in §5. Build it per §4 (TDD, injected deps, additive migration if needed). Verify per §7 (tests green, zero new type errors). Commit atomically staging only co-pilot files. Tick the box with the commit SHA. If you hit a §8 gate, mark the task blocked and move to the next. Repeat.
