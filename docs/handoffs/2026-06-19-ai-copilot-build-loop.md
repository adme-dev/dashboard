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
- [x] **WS-C.1** mig 181 `ai_action_audit` (ledger) — DONE (`cc4d356a`, applied to prod Neon).
- [x] **WS-C.2** audit row written in the confirm path (proposer/confirmer/tool/risk_tier/client_scope/result_ref/outcome), pure mapper + fail-safe writer — DONE (`4f55589d`, 36/36 AI tests green).
- [x] **WS-A.1** mig 180 `ai_user_memory` — DONE (`5318e414`, applied to prod Neon).
- [x] **WS-A.2** `memory/{types,store}.ts` (injected db) + `memoryStore.test.ts` — DONE (`b41a81d2`, 9 tests).
- [x] **WS-A.3** `memory/retrieve.ts` pure scoring + `memoryRetrieve.test.ts` — DONE (7 tests).
- [x] **WS-A.4** `aiVectorize.searchSimilar` optional metadata `filter` + pure `resolveSearchArgs` + test — DONE (6 tests, 194/194 regression).
- [x] **WS-A.5** `memory/render.ts` (≤200-token block) + test — DONE (4 tests).
- [x] **WS-A.6** `tools/remember.ts` (explicit capture, non-mutating) + registered + in persona COMMON + test — DONE (203/203).
- [x] **WS-A.7** `memory/distill.ts` (pure prompt + tolerant parser + injected gpt-oss-20b, dedup, cap 3, fail-safe) + test — DONE (10 tests). Flag check lives in WS-A.8.
- [x] **WS-A.8a** memory orchestration (`memory/orchestrate.ts`) + retrieve/inject wired into `aiChatEngine.ts` system prompt + **cross-user isolation test** — DONE (7 tests). Read path live behind `AI_TOOLS_ENABLED`.
- [x] **WS-A.8b** distiller WRITE enqueue (fire-and-forget, behind `AI_MEMORY_DISTILL_ENABLED`) in `aiChatEngine.ts` after the turn — DONE (`80fb973b`). `distillAndStoreMemories` in orchestrate.ts (gpt-oss-20b via `generateGroqInsight`, dedup vs recent, save as `inferred`), wired via `runAfterResponse`, flag added to `nuxt.config.ts`. 7 tests, 227/227 AI suite green. **Phase 0 COMPLETE.**

### Phase 1 — Read-everywhere skill-packs (parallel, zero write risk) — COMPLETE
- [x] `media_buyer` persona + `rolePersona.ts` role→default-persona map + wire into `aiChatEngine` — DONE (`45bca284`). Engine resolves persona as explicit → conversation-persisted → role-default → generalist; client picker mirror synced; 5 tests.
- [x] Read tools: `get_campaign_breakdown`, `get_budget_health` (gate `MEDIA_BUYING`) + tests — DONE (`5eb319b3`). Thin injected-deps wrappers over analytics/campaigns + budget-alerts/health; 10 tests; added to media_buyer allowlist; registry now 15 reads + create_task + remember (17).
- [x] Finance/Account/Sales/Creative read tools — already covered: the finance/account/sales personas (Slice 1.5) + Slice-2 margin tools give each role a day-1 read assistant via the role-default map. `creative`→`marketing` pack (no dedicated creative reads needed yet). No net-new tools required.

### Phase 2 — Execute, role by role (flag-gated, propose→confirm→audit) — COMPLETE
- [x] **`propose_schedule_post`** (`72248b96`) — CREATIVE-gated, `confirm`. Resolves client→id, plans a draft/scheduled `social_posts` row via the publishing endpoint on confirm. First non-task executor (proved the WS-B generalization). In the marketing pack.
- [x] **`propose_budget_alert`** (`11ef4c99`) — ADMIN-gated (matches the owner/admin endpoint), `confirm`. Resolves client→id, creates the alert on confirm. Surfaced via the generalist (not a focused pack, since it's RBAC-dropped for non-admins).
- [x] **`propose_budget_change` (rich_confirm)** (`c30e99ca`) — the flagship + the first MEDIA_BUYING write the media_buyer role can execute. **Not blocked after all** — the budget-write apply-chain (`server/api/agency/social/spend/[id]/actions/*` + `budgetExecution.ts`) is present on this branch. Resolves the campaign from the canonical pacing review (so current daily budget matches the UI); **executor only PLANS** into the existing approve→execute chain (`source: 'ai_copilot'`) — never a live platform write (that stays behind the chain's flag + `decideExecution`). In the media_buyer pack.
- [x] **Counter-model sanity check** (`c30e99ca`) — pure `budgetSanityCheck.ts` (gpt-oss-20b, fail-open advisory), run at propose time, surfaced on the card.
- [x] **Rich confirm-card UI** (`e49b0e30`) — `AiProposedActionCard` renders per `toolName` (task / post / alert / rich budget-change with current→proposed/%/sanity/rollback); rich card sends `richConfirmAck`. Also generalized `extractLoopOutput` so EVERY propose tool surfaces a card (was create_task-only).

**Phase 2 status:** all four write tools + counter-model + rich card built, 299/299 AI tests green, zero new type errors, **all dormant behind `AI_TOOLS_ENABLED`** and (for budget_change) the existing budget-write flag. No live external writes — budget changes only PLAN into the reviewed chain. Marketing-page sync still deferred to go-live.

### Phase 3 — Orchestration & surfaces
- [x] **Traffic controller L1 auto-routing** (`d1df13ef`) — `controller/{registry,route}.ts`; per-turn skill-pack selection by intent+role (explicit → intent → role-default → generalist), RBAC-bounded, wired into `aiChatEngine` after intent. 10 tests.
- [x] **Traffic controller L2 supervisor** (`bc2bbc55`) — `controller/{classify,route.planSpecialists,delegate,synthesize}.ts`; cross-domain decompose→delegate(parallel, RBAC-pruned, fan-out≤3)→synthesize, behind `AI_CONTROLLER_L2_ENABLED` (dormant). Composition-escalation-safe. 27 tests. (Note: the controller is **unreviewed** — run `/code-review high` before merge.)
- [x] **Command Center v1 (Observe)** (`dcf61b71`) — `commandCenter.ts` pure shapers + `GET /command-center/overview` (MANAGEMENT-gated: open proposals, audit feed, 30-day cost/usage, memory stats) + `/agency/ai/command-center` page. 9 tests.
- [x] **`propose_knowledge_article` + KB review/publish queue + mig 182** (`ce30730f` + `a93308fb`) — agent KB contribution as `is_published=false` drafts (explicit, never auto-publish); in COMMON; mig 182 provenance applied to prod Neon; `GET /command-center/kb-drafts` + `PATCH /knowledge/:id/{publish,reject}` (publish embeds via `embedKnowledgeArticle`) + a review section in the Command Center. 19 tests.
- [x] **Virtual office Mode A — room-scoped context** (`ad40b6fa`) — `ToolContext` gains optional `officeId?`/`meetingId?`; new `office/roomContext.ts` (PURE `renderRoomContext` + injected-deps `resolveRoomContext`, membership-gated tenant isolation, co-member-only roster) wired into `aiChatEngine` (prompt enrichment + ctx threading on L1 + L2) + `messages.post.ts`/`useAiChat.sendMessage` accept a `room`. 13 tests, 366/366 AI green. **Remaining:** the office-page dock UI (embed the chat, feed it live DO presence/meeting/transcript) + a `frontend-design` pass — follow-up. Mode C/Mode B are separate later tasks. **UI DONE** (`a95c3266`): `OfficeCopilot.vue` dock in `office.vue` passes live room (officeId + present staff ids).
- [x] **Portal Tier 1 — isolation foundation** (`538776f4`) — the highest-stakes surface (outside the agency trust boundary), so the hard-tenant-isolation core shipped first with the fuzz test as the gate. `portalTools/portalContext.ts` (`PortalToolContext` clientScope REQUIRED + `assertPortalScope` hard-error + injected `PortalDb` + `toPortalSdkTools` re-asserting scope), `portalTools/index.ts` (SEPARATE registry — agency tools physically absent; `buildPortalTools` asserts scope then converts only the portal registry), 5 read tools (`get_my_approvals/_invoices/project_status_portal/_briefs/_leads`, each `WHERE client_id=$1`, never trusts a model id). 8 tests incl. the cross-tenant fuzz gate. 374/374 AI green, no migration. **Remaining:** the live portal loop (generateText over the portal registry) + portal chat endpoint (clientAuth) + `PortalCopilot.vue`, `get_my_social_report` (reuse `socialReporting/portal.ts`), per-client app-assignment config (toolset = enabled apps ∩ portal-safe), and Tier 2 (`respond_to_approval` + `client_scope` columns on `ai_pending_actions`/`ai_action_audit`). **ALL DONE this session:** live loop+endpoint (`ef13f744`, mig 184, flag `AI_PORTAL_ENABLED`), `get_my_social_report` (`993d04d4`), app-assignment (`43cc73f6`, mig 185), Tier 2 `respond_to_approval` (`9d5d5874`, mig 186, flag `AI_PORTAL_WRITES_ENABLED`), `PortalCopilot.vue` (`dd7444dd`).
- [x] **Self-service config — Personalize tier** (`5e88ccfa`) — `ai_agent_configs` (mig 183) + `agentConfig.ts` (config SUBTRACTS only) + GET/PUT `/api/agency/ai/my-assistant`. **UI DONE** (`b80d4c02`): `my-assistant.vue` settings page (persona/memory/per-tool toggles) + `GET .../my-assistant/tools` + Command-Center link. **Remaining:** Build/Govern tiers (shared mini-skill-packs, kill-switch) — separate larger backend feature, deferred.

## 5b. Per-department execute build-out (PRD §7 blueprint) — COMPLETE

The PRD's core promise — a co-pilot that *executes* for every role — is now built across all departments (was Media-Buyer-only). All propose→confirm→audit, name→id resolution with disambiguation, dormant behind `AI_TOOLS_ENABLED`.

- [x] **Account Manager / Producer** (`3e15eccc`) — `assign_task`, `propose_status_change`, `propose_brief_convert` + `get_capacity` (read). In the `account` pack.
- [x] **Sales / CRM** (`dba8de4b`) — `propose_opportunity`, `log_crm_activity`, `propose_quote` + `draft_followup` (read). Client-scoped resolvers. In the `sales` pack.
- [x] **Finance / Bookkeeper** (`0ef122fe`) — `propose_expense_approval`, `propose_eom_generate` (rich_confirm + ADMIN), `propose_expense_classify`. In the `finance` pack.
- [x] **Creative** (`5eda9250`) — `get_my_creative_queue` (read) + `propose_proof_status`. In the `marketing` pack.
- [x] **`/code-review high` on the packs** (`8a54cbd8`) — fixed: EOM was unconfirmable (rich-confirm ack generalized on the card + voice surfaces); `propose_quote` gating matched to the endpoint's pricing-access (was a `lead` propose-then-403); brief-convert resolver now only matches convertible briefs. Refuted: audit resultRef (it IS populated via the `taskId` alias), expense-classify (endpoint-guarded).

Registry is now **30 tools** (was 21). **Deferred:** banner/image **generation** (heavy/synchronous/concurrency-capped render — better from the Banner Studio UI than chat). **Note (pre-existing, platform):** several underlying mutation endpoints (`eom/generate`, `briefs/[id]/convert`, `tasks/[id]/assignee`, `proofs/[id]/status`) gate only `requireAuth` — the role floor for those actions currently lives in the AI tool/executor/confirm layer, not the endpoint. Worth hardening the endpoints if they're reachable from other surfaces.

## 6. Current state

- **Phases 0, 1, 2 COMPLETE + REVIEWED; Phase 3 — controller (L1+L2) + Command Center v1 + KB contribution BUILT + REVIEWED.** Head: `aa59242b`. AI suite **347/347 green**, zero new type errors, all dormant behind `AI_TOOLS_ENABLED` / `AI_CONTROLLER_L2_ENABLED`. Mig 182 applied to prod Neon (additive).
- **`/code-review high` ran on the Phase-3 work (8 angles).** Fixes in `aa59242b`: **L2 sub-runs now READ-ONLY** (was the headline bug — a delegated specialist could persist an orphan, Command-Center-confirmable write proposal); L2 skips on a pinned persona + falls through to L1 on empty findings; `requirePermission()` custom-role-aware gate (inline check 403'd custom MANAGEMENT roles); `[id].put.ts` clears a draft's review_status on publish; L1 router static-imported (role-default no longer lost on import failure); overview queries Promise.all'd; 'work' domain folded into the Account pack.
- **Deferred (non-blocking) review items:** L2 turns under-report cost (classifier + synthesis Groq spend not summed; the sub-loop cost IS counted) — needs `generateGroqInsight` to surface usage; the L2 wire-in (~45 lines) could be extracted to a `controller/index` orchestrator for direct testing; `summarizeUsage` is now unused by the endpoint (kept as a tested util); the Command Center audit feed uses a styled raw `<table>` (CLAUDE.md permits "a custom table with proper styling").
- **Self-service config Personalize tier built** (`5e88ccfa`, mig 183 applied) — config narrows-never-grants, wired + tested; UI + Build/Govern tiers remain.
- **Phase 3 backlog COMPLETE this session.** Head: `a95c3266`. AI suite **400/400 green**, zero new type errors (server + app vue-tsc). Migs 184/185/186 applied to prod Neon (additive, dormant). New flags: `AI_PORTAL_ENABLED`, `AI_PORTAL_WRITES_ENABLED` (both off).
  - Virtual Office Mode A: room-scoped context (`ad40b6fa`) + `OfficeCopilot.vue` dock (`a95c3266`).
  - Portal Tier 1: isolation foundation (`538776f4`) + live loop/endpoint (`ef13f744`, mig 184) + `get_my_social_report` (`993d04d4`) + app-assignment (`43cc73f6`, mig 185) + `PortalCopilot.vue` (`dd7444dd`).
  - Portal Tier 2: `respond_to_approval` propose→confirm→audit (`9d5d5874`, mig 186), doubly dormant.
  - Self-service config: Personalize tier (`5e88ccfa`) + `my-assistant.vue` UI (`b80d4c02`).
- **Remaining (deferred, not started):** Mode C (`meeting_ended`→propose) + Mode B (live voice); office dock meetingId/transcript-tail wiring; Build/Govern config tiers; per-client white-label portal branding.
- **`/code-review high` RAN on the full session diff** (8 finder angles). Fixes in `fcfa9883`: (1) **per-user RBAC bypass** — portal tools now enforce client_user permission flags (canViewInvoices/Projects/Analytics/ApproveWork), not just tenant isolation; (2) `respond_to_approval` was missing from `PORTAL_APP_TOOLS` (Tier-2 unreachable for app-configured clients) — mapped + coverage test; (3) **training-data isolation** — the agency LoRA extractor now excludes portal rows (`c.user_id IS NOT NULL`) so customer convos never enter the agency corpus; (4) My Assistant tool count. Refuted: ai_messages has no user_id (portal inserts safe); POST-with-event.headers is the established executor pattern.
- **Deferred (non-blocking) review items:** (a) `transcriptTail` from the office dock body is injected into the system prompt un-spotlighted — self-injection within the staff user's own RBAC only; spotlight it when Mode A wires live transcript. (b) `getEnabledPortalApps` fails OPEN (DB error → default-all toolset) — defense-in-depth, still tenant-safe; consider fail-closed. (c) Real duplication to refactor later: the 6 portal read tools share one shape (a `portalListTool` helper); `portalConfirm.executePortalProposal` forks `pendingActions.executeProposal`; `PortalCopilot.vue`≈`OfficeCopilot.vue` (~85% — extract a `useCopilotChat`/`CopilotShell`); `portalLoop` copies `toolLoop`'s generateText+fallback block.
- **Still UNREVIEWED (pre-session commits):** `5e88ccfa` (self-service config). **Visual UAT pending** for the 4 UIs. Nothing deployed; no flags flipped; not on `main`.
- **`/code-review high` ran on the Phase-2 writes (8 angles).** Fixes shipped in `77c0fac7` (server) + `59d88c6b` (voice): budget-alert executor read the wrong id field (`alert.id`) → every confirm showed a false failure (FIXED); `pctChange` forced to 0 on a from-$0 turn-on hid the riskiest change from the counter-model + card (now null + explicit prompt); **confirm-time permission re-check** added (`ActionExecutor.requiredPermission` + endpoint enforces it as the confirmer — closes the role-downgrade window) with a parity test guarding rich_confirm/permission drift; voice mode now sends `richConfirmAck` + per-tool spoken notes (was create_task-only, which broke budget-change voice confirm); dead `parseSanityResult` branch + O(n²) `resolveCampaign` scan cleaned up; `toolName` threaded through the voice/chat proposedAction types.
- **Deferred (non-blocking) review items:** shared `resolveClientByName` helper + `makePostExecutor` factory + generalize `pickByExactName` (real duplication across the 3 propose tools — a cleanup refactor); the card's triple `switch(toolName)` → a config map; counter-model runs on every budget-change propose (kept always-on: safety > latency for a rare high-risk write); `resolveCampaign`/plan endpoint aren't per-client tenant-scoped (consistent with the existing budget-write chain + the prior "agency staff manage ALL clients" decision).
- Next: merge (human-gated). Recommended Phase-3 start: Command Center v1 (Observe proposals/audit/cost/memory) or Traffic-controller L1.
- _(prior)_ **Phase 0 + Phase 1 COMPLETE + REVIEWED.** Head was `ddbbf46a`. AI suite 259/259. Migs 180+181 applied to prod Neon (dormant). Nothing deployed, no flags flipped.
- **`/code-review high` ran on the Phase 0+1 AI work (8 finder angles).** 10 findings; all 10 actioned across `08f98aad` (memory: #1 embed-on-write + uuid cast, #2 in-query isolation, #7 render budget, #8 post-dedup cap) and `ddbbf46a` (#3 rich_confirm gate, #4 terminal-executor, #5/#9 campaignBreakdown window caveat + platform push, #6 remember fail-safe, #10 topK=0 guard). +14 tests. Residuals: **#1 vector recall now wired but only *functions* once the Vectorize binding + embeddings exist live (degrades safely to recency until then); #3 gate is dormant** (no rich_confirm executor registered yet — it activates with `propose_budget_change`); **#9 budgetHealth over-fetch left as-is** (the shared `budget-alerts/health` endpoint takes only month/year — no server-side filter to push to).
- Earlier loop commits: `80fb973b` (WS-A.8b), `45bca284` (media_buyer persona + role map), `5eb319b3` (2 media-buyer reads).
- **Next up: Phase 2 writes — has gates.** `propose_budget_change` BLOCKED (apply endpoint not on this branch). `propose_budget_alert` needs a permission decision (endpoint owner/admin-only). `propose_schedule_post` is the one cleanly-unblocked write. The #3 rich_confirm gate is now in place to receive `propose_budget_change` safely.
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
