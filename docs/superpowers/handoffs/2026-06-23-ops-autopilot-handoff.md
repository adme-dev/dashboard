# Handoff — Ops Autopilot (Digital Advertising Department Automation)

**Date:** 2026-06-23
**Branch:** `feat/ops-autopilot-dept-automation` (worktree at `.worktrees/ops-autopilot`, off `main`)
**Status:** 4 slices built, reviewed, committed — NOT merged, all DORMANT behind flags.
**Next task:** **A.3 — the lifecycle state machine** (deliberately deferred to a fresh session; it's the one architectural/risky slice — see §6).

---

## 0. How to resume (fresh session)

1. Open this repo. The work lives in the **worktree** `.worktrees/ops-autopilot` on branch `feat/ops-autopilot-dept-automation`. Do work there (`git -C .worktrees/ops-autopilot ...`), not in the polluted `main` checkout.
2. Read, in order: the program spec → this handoff → the SDD ledger:
   - Spec: `docs/superpowers/specs/2026-06-22-ops-autopilot-dept-automation-design.md`
   - Plans: `docs/superpowers/plans/2026-06-22-ops-autopilot-phaseA1-escalation-spine.md`, `…-C1-pacing-watchdog.md`, `…-C2-ad-report-engine.md`
   - SDD ledger (per-task commit record): `.superpowers/sdd/progress.md`
   - Memory: `~/.claude/projects/-Users-paulgiurin-Documents-Projects-dashboard/memory/ops-autopilot-program.md`
3. Env quirks for the worktree (REQUIRED before running tests/typecheck):
   - `node_modules` is **symlinked** from the main checkout (already done). If missing: `ln -s <repo>/node_modules .worktrees/ops-autopilot/node_modules`.
   - Run `pnpm -C .worktrees/ops-autopilot exec nuxi prepare` once if `.nuxt/` is missing (vitest `test/setup.ts` + `tsc -p .nuxt/tsconfig.server.json` need it).
   - **`.env` is only in the main checkout**, not the worktree. For migrations: `DATABASE_URL=$(grep '^DATABASE_URL' <repo>/.env | cut -d= -f2-)`.
   - Tests: `pnpm -C .worktrees/ops-autopilot exec vitest run <file>`.
4. Execution method that's working this session: **subagent-driven development** (plan → fresh implementer subagent per task → review → final whole-slice review on opus). Subagent file-writes WORK this session. Keep my/your context lean by handing briefs/reports as files under `.superpowers/sdd/`.

## 1. What this program is

Turn the dashboard into a **Department Operating System** for Digital Advertising: AI runs the job lifecycle (brief→billing) and calls a human only at gates. Born from "automate Craig's role" → expanded to the whole delivery team (Craig 82751293 / Garrix 78099299 / Hannah 99302407 as role-holders; Matthew 24000966 = approver). Production stays human.

**Locked decisions (do NOT relitigate):**
- **Dashboard = system of record** (migrating off Monday).
- **Autonomy ceiling: spend/deploy is ALWAYS human-approved** (budget changes, campaign activation). Non-spending work auto-runs.
- **Dual-surface:** deterministic cron autopilot + the Digital Advertising dept AI assistant (tools over the existing registry).
- **Graduated autonomy** via the existing `riskTier` (auto / confirm / human-only).

## 2. Phase roadmap

A (spine) → B (safe capabilities C1–C7) → C (role-agents) → D (lifecycle gap-fillers + Job Bag/funnel decomposition) → E (gated ad-platform deployment; blocked on Meta Advanced Access + Google Standard dev token). Each phase = its own spec/plan/build.

## 3. What's BUILT (this branch, reviewed READY, dormant)

| Slice | What | Commits | Tests | Migration | Dormancy |
|---|---|---|---|---|---|
| **A.1 escalation spine** | `automation_escalations` table + pure module + DB adapter + notify helper + AUTOMATION-gated list/decide endpoints | `ca5debe7..e05093e6` | 7 | **192** (applied live) | AUTOMATION-gated endpoints; inert until a capability raises |
| **A.2 inbox UI** | `/agency/automation/escalations` page + `AutomationEscalationCard` + `useAutomationEscalations` + `escalationDisplay` helper + nav entry | `26603bf6,50423249,f629b1a4` | 7 | — | role-management gated |
| **C1.1 pacing watchdog** | `pacingWatchdog.ts` (pure+runner) + `ops-autopilot-pacing` cron + `check_pacing` AI tool | `092350bf..08f2e727` | 7 | — | `?` no flag, but cron NOT registered (dormant) |
| **C2.1 ad-report engine** | `ad_report_schedules` + `adReporting/{model,html,send}.ts` + `send-ad-reports` cron | `f5eea23b..3566d1d7` | 15 | **193** (applied live) | `AD_REPORTS_ENABLED` off + cron not registered |

Total ~20 commits on the branch. Final reviews (opus) all returned READY TO MERGE. The full vertical loop works: campaign paces badly → C1 watchdog raises an escalation → A.2 inbox → human approves/rejects; and C2 emails monthly client ad reports.

**Key reusable primitives now on the branch:**
- `raiseEscalation(input)` (`server/utils/automation/escalationsStore.ts`) — any capability calls this to escalate.
- `notifyEscalationApprovers({escalationId,capability,title,severity})` (`notifyEscalation.ts`).
- The injected-deps report orchestrator pattern (`adReporting/send.ts`) mirrors social `processDueReports`.

## 4. Activation steps (operator — when ready to go live; all currently dormant)

- **A.1/A.2:** live already as endpoints+UI but nothing raises escalations until C1 is activated. Operator visual check of the inbox (dev server + AUTOMATION login) still pending.
- **C1 pacing watchdog:** register `/api/cron/ops-autopilot-pacing` in `workers/pages-cron` + add a daily trigger; run `?force=true` smoke (re-run → `raised:0` proves dedup). **Roll out with notification-allowlist discipline like the anomaly cron** — `no_spend`/`paused_with_budget` are always *critical* → first-run email burst risk.
- **C2 ad reports:** register `/api/cron/send-ad-reports`; set `AD_REPORTS_ENABLED=true`; seed an `ad_report_schedules` row; run the `?force` smoke.

## 5. Gotchas / conventions

- **Migration numbering:** highest on `main` is 189; this branch added **192** (escalations) + **193** (ad_report_schedules), both applied to the live DB. `190/191` are on other in-flight branches (`feat/mcp-phase2b-video`). Verify next free number at execution + flag merge collisions.
- **Tests:** repo unit-tests PURE functions (under `test/`); DB/endpoint code is verified by typecheck + the pure tests + operator smoke (no DB mocking convention). `tsc` has ~60 pre-existing unrelated errors + `typescript.strict:false` — grep tsc output for your file only.
- **app/utils import alias:** components/pages import via `~~/app/utils/...`; vitest tests import via `~/utils/...`.
- **Deploy** (if ever): from a clean full-install checkout, NOT the symlinked worktree (symlinked node_modules breaks `nuxt build` prerender — see CRM memory). Build needs 16GB heap.
- **Monday read access:** token in `integration_configs` (`integration_type='monday'`); account `adme2` / id 229224.

## 6. NEXT TASK — A.3 lifecycle state machine (design first, then build)

A.3 adopts the **live 34-value Monday "Status" taxonomy** (Brief Required → Copy Required → Awaiting Assets → Working On It → QA / QA New Campaign → Awaiting Approval / Awaiting Client → Done, plus Budget Update / Check Daily / Stop Campaign / Roll This-Next Month) as an explicit, auditable state machine on the dashboard's `tasks`/`task_statuses`. **This is the one slice that touches live agency workflow data — design carefully, don't rush.**

**Decisions to settle before planning (the design pass):**
1. **Mapping vs migration:** add a *mapping layer* (status string → lifecycle stage + gate type) WITHOUT altering `task_statuses` rows, vs. extending `task_statuses` with stage/gate columns. (Lean mapping-layer = lower risk to live data.)
2. **Gate types per stage:** which statuses are 🟢 auto / 🟡 human-approve / 🔴 human-only (per spec §3 table).
3. **Auto-advance integration:** how transitions fire WITHOUT double-firing against the EXISTING `automation_rules` engine (`automation_rules`/`automation_executions`/`board_automations` all live) and the existing `approval_workflows`/`task_approvals`. Avoid two systems both moving a task.
4. **Escalation tie-in:** 🟡 transitions raise an `automation_escalations` row (reuse A.1) rather than a new mechanism.

**Grounding pointers (verify live before planning):**
- `server/database/schema-workflow.sql` — `tasks`, `task_statuses`, `approval_workflows`, `approval_workflow_steps`, `task_approvals`, `task_approval_responses`.
- `server/database/schema-automation-rules.sql` — `automation_rules`/`automation_executions` (the existing trigger/condition/action engine — do NOT duplicate it).
- The real 34 statuses live in the Monday Marketing board (id 13392458) "Status" column; the dashboard's `task_statuses` is the dashboard-side equivalent — confirm current values via `SELECT category, name FROM task_statuses` and how `tasks.status_id` is used.

**Recommended A.3 first slice:** a pure `lifecycle.ts` mapping module (status → {stage, gate}) + a thin transition-guard that, on a task status change, decides auto-advance vs raise-escalation — fully additive, reusing A.1 escalations + the existing engine, no changes to live `task_statuses` rows. Defer the full "drive every job through the machine" until the mapping + guard prove out.

## 7. Remaining roadmap after A.3

- **C3** Campaign QA linter (AI, read-only; reuses the AI tool registry like `check_pacing`).
- **C4** Conversion-tracking health monitor (`tracking_events` + GA4 + `fetchGtmConfig()`; needs a `client_conversion_actions` registry).
- **C5** Brief-completeness gatekeeper; **C6** monthly roll-over; **C7** actioned-confirmation loop.
- **D** Gap-fillers (traffic-control auto-routing, auto-advance-on-approval, approval SLAs, auto-mark-billable, go-live→monitoring handoff) + **Job Bag / funnel** decomposition (`job_types`, `job_bags`, cross-dept fan-out to the `ADME Creative Request` board, `client_inventory_feeds` for AIA/PMax).
- **E** Campaign deployment to Meta/Google (paused-draft → human-activate; blocked on API access).
- **Follow-ons logged:** C1.2 (TZ-aware period, escalation clientId linkage, flood guard, auto-resolve, register cron); C2.2 (schedule CRUD/UI, GROUP BY campaign, weekly cadence); A.2 operator visual check.

## 8. Finishing the branch

Branch is KEPT (not merged/pushed) per the program. Before any merge: operator visual check of A.2; run C1/C2 smokes; verify migrations 192/193 on the target DB. Pushing to the remote needs the `adme-dev` gh account (Paul008 gets 403) + `gh auth setup-git`.
