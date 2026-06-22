# A.3 — Lifecycle State Machine (design pass)

**Date:** 2026-06-23
**Branch:** `feat/ops-autopilot-dept-automation` (worktree `.worktrees/ops-autopilot`)
**Status:** Design — settles the four §6 decisions from the handoff, grounded in the live schema + DB.
**Parent spec:** `docs/superpowers/specs/2026-06-22-ops-autopilot-dept-automation-design.md` (§3 the state machine, §2.5 operational reality, §4 reuse map)
**Predecessors on branch:** A.1 escalation spine, A.2 inbox, C1.1 pacing watchdog, C2.1 ad-report engine.

---

## 0. TL;DR

A.3 is a **pure lifecycle mapping module** (`lifecycle.ts`) + a **thin, additive transition guard** that hooks the existing task status-change chokepoint and, for 🟡 gates, raises an A.1 escalation. **No changes to `task_statuses` rows. No new table. No competition with the existing automation engine.**

A grounding pass against the live DB produced a finding that **reduces** A.3's risk and **reframes** its value (see §1): the rich Monday status taxonomy is *not in the dashboard yet*, so the guard is inert on today's data and serves as the forward contract every later capability (C5/C6/C7/G2) reads.

---

## 1. Finding that reshapes the slice — the taxonomy is not in the dashboard

The handoff (§6) assumed "the dashboard's `task_statuses` is the dashboard-side equivalent" of the 34 Monday statuses and warned A.3 "touches live agency workflow data — design carefully." The DB says otherwise:

| Probe | Result |
|---|---|
| `task_statuses` rows | **1043**, but ~99% are the generic triad **To Do / In Progress / Done** replicated **per board** (`department_id`). A handful of boards add Review / Backlog / Internal Review. The 34 Monday values are **absent**. |
| `tasks.status_id` distribution (38,524 tasks) | **37,814 "To Do" + 710 "Backlog"** — the import flattened every Monday status into "To Do". |
| `tasks.status` (legacy varchar) | **`'todo'` for all 38,524 rows** — 1 distinct value. |
| `tasks.monday_item_id` / `monday_board_id` | present (import preserved provenance) — but the **Status column values were not carried over**. |

**Conclusion.** The Monday → dashboard migration imported *items* but collapsed their *statuses*. The 34-value taxonomy lives only in Monday (Marketing board 13392458) today. Therefore:

- A.3 **cannot** be "react to live rich status changes" — there are none. The risk the handoff feared (touching live workflow data) **does not exist**; the data is generic.
- A.3 **should** be the **canonical lifecycle taxonomy** for the dashboard: a single source of truth mapping `(status name | category) → {stage, gate, owner}` that the eventual status migration *and* every later capability consume. It is a **forward contract**, valuable to build now precisely because it defines the target the migration fills in.
- The transition guard is **additive and effectively dormant on today's data** (generic statuses map to a neutral stage with a 🟢 gate → no escalation), and acquires teeth automatically as rich statuses arrive (full status migration, or capabilities like C5/C6 that set them).

This makes the recommended first slice **lower risk than the handoff anticipated** while still being the correct architectural spine.

---

## 2. The four decisions — settled

### Decision 1 — Mapping layer, NOT migration ✅
**Settled: mapping layer.** A pure `lifecycle.ts` module maps a status **name** (the canonical Monday string) or, as fallback, a `task_statuses.category`, to a lifecycle `{stage, gate, owner}`. **No ALTER of `task_statuses`, no new stage/gate columns, no row edits.** Evidence makes this decisive: editing 1043 mostly-generic rows would add risk for no gain, and the rich strings the gates key on aren't even in those rows yet. Keeping the taxonomy in code (versioned, unit-tested, one source of truth) is strictly safer and is what the later migration will target.

### Decision 2 — Gate types per stage ✅
**Settled** from parent spec §3 + §2.5, applying the hard rule *spend/deploy/client-facing/billing = 🟡; production/strategic = 🔴; analytical/internal-prep/nudges/terminal = 🟢*. Full table in §3 below.

### Decision 3 — Auto-advance integration without double-firing ✅
**Settled: hook the existing chokepoint, separate concern, no `move_to_status`.** The single-task status change endpoint `server/api/agency/tasks/[id]/status.patch.ts` already, after committing the change, fans out three things via `enqueue(event, …)` (queue with retry, fire-and-forget fallback):
1. `board.notify` → `notifyBoardSubscribers`
2. `board.automate` → `evaluateAutomations` (the `board_automations` engine)
3. (chat bridge)

A.3 adds a **fourth, sibling** enqueue: `lifecycle.evaluate` → `evaluateLifecycleTransition(boardEvent)`. It is a **distinct concern**: it reads the lifecycle map and, for a 🟡 transition, **raises an `automation_escalation`** (A.1). It **never issues `move_to_status` / `update_field`** — mutation of task state stays owned by the existing `board_automations` / `automation_rules` engine and by humans. So the two systems can never both move a task: A.3 *observes and gates*, the engine *mutates*. For 🟢 transitions the guard does nothing in this slice (driving auto-advance is deferred to gap-filler **G2**, which will be the one place that calls `move_to_status`). 🔴 transitions are likewise observed only.

> Why a sibling enqueue and not a `board_automations` rule: a rule doing `move_to_status` *would* compete with the engine and risks loops. The guard is read-only-to-tasks by construction, which is the structural guarantee against double-firing.

### Decision 4 — Escalation tie-in reuses A.1 ✅
**Settled: reuse `automation_escalations` + `raiseEscalation()`.** A 🟡 transition raises `{ capability: 'lifecycle_gate', title: '<Stage> gate: <task title>', severity, clientId, runId: <transition key>, detail: {taskId, fromStatus, toStatus, stage}, proposedAction: {action:'advance_stage', taskId, toStatus}, assignedRole: <stage owner role> }`. It surfaces in the existing `/agency/automation/escalations` inbox (A.2). Dedup mirrors C1 exactly: before raising, `SELECT detail FROM automation_escalations WHERE capability='lifecycle_gate' AND status='pending'` and filter by a `dedupeKey(taskId, toStatus)`. Critical-severity gates notify approvers via `notifyEscalationApprovers` (same as C1). **No new mechanism, no new table.**

---

## 3. The lifecycle taxonomy (the forward contract)

Each canonical status string maps to one of the 11 lifecycle stages (parent spec §3) with an owner and a gate. Generic dashboard categories map as a coarse fallback so today's data resolves cleanly to a no-op gate.

| Canonical status (Monday) | Stage | Owner role | Gate |
|---|---|---|---|
| Brief Required, Copy Required (brief-side), Awaiting Assets, Awaiting OEM Offers | 1 Brief / intake | Account manager | 🟢→🟡 (C5 gatekeeper) |
| *(approved brief → task)* | 2 Create job | AM + AI | 🟢 |
| *(unassigned, needs routing)* | 3 Traffic / assign | Traffic controller | 🟢 |
| Working On It, Active Graphic Design, Active Web Projects, eDM's, Prep Final File, Upload | 4 Production | Garrix / Hannah | 🔴 |
| QA, QA New Campaign, Designer QA, Review Required | 5 Internal QA | Craig (AI-assisted) | 🟢→🟡 (C3 lint gate) |
| Awaiting Creative Approval | 6 Proofing | AM → client | 🟡 |
| Awaiting Approval, Awaiting Client, Approved | 7 Approval | Matthew / client | 🟡 |
| *(build & deploy / go-live)* | 8 Deployment | Media buyer | 🟡 **spend** |
| Check Daily, Budget Update, Stop Campaign | 9 Live monitoring | Craig (AI) | 🟡 **spend** (changes); 🟢 scans |
| *(report run)* | 10 Reporting | AM (AI) | 🟢 |
| Approved To Be Billed, Checked, Query for Alicia | 11 Billable | Matthew / Alicia | 🟡 |
| Roll This/Next Month | (recurring) | Ops (C6) | 🟡 |
| Done, [Platform] Completed [Month] | terminal | — | 🟢 |
| **Fallback:** `category` not_started / in_progress / review / done / cancelled | (coarse) | — | 🟢 (no gate) |

**Unknown status string → resolves to `{stage: 'unknown', gate: 'auto'}` (no-op).** Never throws, never blocks a status change. The guard is fail-open by construction: it can only *add* an escalation, never reject a transition.

Module shape (pure, no I/O — unit-tested like `escalations.ts` / `pacingWatchdog.ts`):

```ts
// server/utils/automation/lifecycle.ts
export type LifecycleGate = 'auto' | 'human_approve' | 'human_only'  // 🟢 / 🟡 / 🔴
export interface LifecycleStage { key: string; label: string; owner: string; gate: LifecycleGate }
export function resolveStage(statusName?: string|null, category?: string|null): LifecycleStage
export function classifyTransition(from: {name?,category?}, to: {name?,category?}):
  { stage: LifecycleStage; requiresEscalation: boolean }   // requiresEscalation = entering a 🟡 stage
export function lifecycleTransitionToEscalation(args: {...}): EscalationInput   // mirrors pacingItemToEscalation
export function dedupeKey(d: { taskId?, toStatus? }): string
export function filterAlreadyPending(candidates, pendingDetails): EscalationInput[]
```

---

## 4. First slice — scope (what A.3.1 ships)

**In:**
1. `server/utils/automation/lifecycle.ts` — pure taxonomy + `classifyTransition` + escalation builder + dedupe (mirrors `pacingWatchdog.ts` shape).
2. `server/utils/automation/lifecycleGuard.ts` — thin DB adapter `evaluateLifecycleTransition(boardEvent)`: resolve from/to status names → `classifyTransition` → if 🟡 and not already pending → `raiseEscalation` (+ `notifyEscalationApprovers` on critical). Fail-open (errors logged, never thrown — same contract as `evaluateAutomations`).
3. One-line hook in `status.patch.ts`: a sibling `enqueue(event, 'lifecycle.evaluate', boardEvent, () => evaluateLifecycleTransition(boardEvent))` next to the existing `board.automate` enqueue.
4. Unit tests for `lifecycle.ts` (taxonomy mapping, gate classification, dedupe, fail-open on unknown) — fixtures, no DB. Target parity with C1's 7-test bar.

**Out (later slices / gap-fillers):**
- **G2 auto-advance** (the only thing that will call `move_to_status` on 🟢) — deferred deliberately.
- Hooking the *other* status-write paths (`bulk.patch.ts`, `[id].put.ts`, Monday import) — first slice proves the pattern on the canonical single-task path; the guard module is path-agnostic and reused later.
- Full "drive every job through the machine" + a lifecycle visualisation UI.
- The status migration itself (see §5).

**Dormancy:** additive; inert on today's generic data (everything resolves to 🟢/unknown → zero escalations). No flag strictly required since it cannot act without a 🟡 transition, but gate it behind a check of the existing **AUTOMATION** posture for consistency with the program (decide at plan time: env flag `LIFECYCLE_GUARD_ENABLED` vs rely on structural dormancy — lean: structural dormancy + the enqueue is cheap, but add the flag if we want a kill switch).

---

## 5. Open items / dependencies (do NOT block the first slice)

1. **Status taxonomy migration (gates A.3's *teeth*, not its *build*).** A.3 only delivers operational value once tasks carry rich statuses. Options for the operator/product call:
   - (a) Complete the Monday Status import into a per-board `task_statuses` set + remap `tasks.status_id` (heavy, touches 38k rows); or
   - (b) Carry the Monday status string in a dedicated column / custom column and have the guard read that; or
   - (c) Let it fill in organically as capabilities (C5 brief gatekeeper, C6 roll-over) start setting rich statuses.
   **Recommendation:** ship A.3.1 as the contract now; defer the migration choice to a dedicated slice once a capability actually needs to *read* a real status. Logged, not blocking.
2. **Owner-role → approver resolution.** `assignedRole` on the escalation is a role string today (A.1 default `'AUTOMATION'`). Mapping stage owner → notifiable approver reuses the A.1/A.2 path; confirm the role taxonomy at plan time (parent spec §9 keying: `client + capability + responsible_role`).
3. **Multiple status-write paths.** `bulk.patch.ts` / `[id].put.ts` / import bypass the guard until later-slice hooks land — acceptable for A.3.1 (no rich statuses flow through them today anyway).

---

## 6. Test & verification plan

- **Unit (the bar):** `lifecycle.ts` — every canonical string → correct stage+gate; category fallback; unknown → no-op; `classifyTransition` flags 🟡 entry; `dedupeKey`/`filterAlreadyPending` parity with C1.
- **Integration/typecheck:** `tsc` grep for the two new files only (repo has ~60 pre-existing unrelated errors; `typescript.strict:false`).
- **Manual smoke (operator, post-merge):** change a task into a status that maps 🟡 (once a board has such a status) → an escalation appears in `/agency/automation/escalations`; repeat the same transition → `raised:0` (dedup proves out), mirroring C1's smoke.
- **No live-platform writes**, no task mutations from the guard — verified structurally (guard only INSERTs into `automation_escalations`).

## 7. Risk

**Low.** Additive module + one-line sibling enqueue at an existing fan-out point; fail-open; cannot reject or mutate a transition; inert on current data; reuses A.1 wholesale. The only behavioural change a user could observe is *new escalations appearing* — and only for 🟡 transitions that don't exist in the data yet. Rollback = remove the one enqueue line.
