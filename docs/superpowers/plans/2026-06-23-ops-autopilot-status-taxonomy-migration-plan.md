# Ops Autopilot — Status-Taxonomy Migration Plan (for review)

**Status:** DRAFT for review — no code/DB changes proposed yet beyond a dry-run script.
**Author:** Claude (2026-06-23). **Relates to:** A.3 lifecycle spec
(`docs/superpowers/specs/2026-06-23-ops-autopilot-phaseA3-lifecycle-state-machine-design.md`),
dept-automation spec (`…2026-06-22-ops-autopilot-dept-automation-design.md`),
the safety PR #161 (lifecycle-guard kill switch).

---

## 1. Why this is the keystone

The A.3 lifecycle state machine (`server/utils/automation/lifecycle.ts`) is a **forward
contract**: it maps ~30 canonical status names → an 11-stage spine → a gate
(🟢 `auto` / 🟡 `human_approve` / 🔴 `human_only`). The lifecycle guard
(`lifecycleGuard.ts`, now behind `LIFECYCLE_GUARD_ENABLED`) raises an escalation when a
task transitions **into a 🟡 stage**.

**It does nothing today because the data is flat.** The Monday import collapsed the live
34-value "Status" taxonomy: all ~38,524 tasks have `tasks.status = 'todo'`, `status_id`
is ~99% a generic "To Do" (+710 Backlog), and `task_statuses` holds only the generic
triad per department. The rich values (Brief Required, QA, Awaiting Approval, Check
Daily, Roll This/Next Month, …) **are absent from the data**, so every transition resolves
to `generic`/`unknown` → `auto` → no escalation.

Until real statuses exist, three things stay blocked:
- **A.3 teeth** — gated transitions never fire.
- **C6 monthly roll-over** — needs the `recurring` stage statuses.
- **C7 brief→"is this actioned?" confirmation loop** — the #1 operational pain Matthew
  reported; needs stages to know what "actioned" means.

## 2. Goal & non-goals

**Goal:** introduce the canonical ad-ops status taxonomy into the live data so the
lifecycle machine has real statuses to act on — **without breaking the existing 38,524
tasks or the board UI**, and reversibly.

**Non-goals (explicitly out of scope here):**
- Auto-advancing tasks (gap-filler G2 / `move_to_status`) — the guard only *raises*, never
  mutates. Auto-advance is a later, separate slice.
- Migrating historical tasks' meaning (see §5 — there is no signal to do this faithfully).
- Building C6/C7 — this plan only *unblocks* them.

## 3. The canonical taxonomy (already encoded)

`lifecycle.ts` already defines the mapping (source of truth — do not duplicate):

| Stage | Gate | Example statuses |
|---|---|---|
| brief | 🟢 (→🟡 via C5) | Brief Required, Copy Required, Awaiting Assets |
| create / traffic | 🟢 | (job creation, assignment) |
| production | 🔴 human_only | Working on it, Active Graphic Design, EDM, Upload |
| qa | 🟢 (→🟡 via C3) | QA, Designer QA, Review Required |
| proofing | 🟡 | Awaiting Creative Approval |
| approval | 🟡 | Awaiting Approval, Awaiting Client, Approved |
| deployment | 🟡 **spend** | (go-live) |
| monitoring | 🟡 **spend** | Check Daily, Budget Update, Stop Campaign |
| reporting | 🟢 | |
| billable | 🟡 | Approved To Be Billed, Checked, Query for Alicia |
| recurring | 🟡 | Roll This/Next Month |
| terminal | 🟢 | Done |

Spend stages (deployment/monitoring) escalate at **critical** severity.

## 4. Schema reality (verified)

`task_statuses` (`server/database/schema-workflow.sql`): `id, department_id` (NULL =
global), `name, slug, color, icon, category` (**CHECK in** `not_started | in_progress |
review | done | cancelled`), `is_default, is_final, sort_order`, `UNIQUE(department_id,
slug)`. Statuses are **department-scoped**, not per-board. `tasks.status` (flat `'todo'`)
+ `tasks.status_id` (→ `task_statuses`).

Implications:
- Adding the rich taxonomy = inserting `task_statuses` rows scoped to the ad-ops
  department(s), each mapped to one of the 5 allowed `category` buckets (the lifecycle
  *stage* is derived from the **name**, not stored — so no schema change to `task_statuses`
  is required).
- The lifecycle machine reads the status **name** → `resolveStage`. So correct `name`
  strings (matching `STATUS_TO_STAGE`, case-insensitively normalized) are what matter.

## 5. Approach options

**A. Full historical migration** — seed rich statuses globally + remap all 38,524 tasks.
❌ Rejected: flat `'todo'` carries **no signal** to infer "Brief Required" vs "QA", so any
bulk remap is a guess; highest blast radius (every task + board column UI).

**B. Parallel `lifecycle_stage` dimension** — keep board statuses generic, drive the
lifecycle off a new/secondary field. ❌ Rejected (for now): introduces two competing
"status" concepts for users; the guard already keys off the status name, so this adds
indirection without product benefit.

**C. Forward-contract seeding, scoped + forward-only (RECOMMENDED).**
- Seed the canonical statuses on **only the ad-ops department/boards** that run the
  lifecycle (Craig / Garrix / Hannah's boards), as selectable statuses.
- **Forward-only**: new work flows through the rich statuses; historical `'todo'` tasks
  stay generic (inert). Optional best-effort remap of *currently-active* tasks can be a
  follow-up, never a blind bulk update.
- Lowest risk, unblocks the lifecycle for the work that matters (ongoing jobs), and keeps
  the 38k historical rows untouched.

## 6. Phased plan (each phase gated; nothing destructive without sign-off)

**Phase 0 — Discovery & confirmation (read-only).**
- Confirm against live DB: which `department_id`(s) / boards are the ad-ops lifecycle
  boards; exact `task_statuses` rows today; how the board UI sources its status options
  (`board_columns` legacy vs `custom_columns` modern — there is known dual-column drift);
  whether `tasks.status` (text) is still read anywhere vs `status_id`.
- Output: the concrete target board/department list + a name→category→sort_order table for
  the ~30 statuses. **← needs a quick data pull; I can do this read-only.**

**Phase 1 — Seed script (additive, reversible, dry-run first).**
- Idempotent migration inserting the canonical `task_statuses` (scoped, `IF NOT EXISTS` by
  `UNIQUE(department_id, slug)`), with category mapping + colors + sort order.
- Dry-run mode that prints the planned inserts; snapshot of pre-state.
- No task remap in this phase.

**Phase 2 — Validate on a throwaway board.**
- Create a scratch board in the ad-ops department, confirm the new statuses render + are
  selectable in the UI, and that moving a task into e.g. "Awaiting Approval" resolves to
  the `approval` stage (assert via a one-off call to `resolveStage`).

**Phase 3 — Apply to ad-ops boards** (operator-gated) + verify UI/data, guard still OFF.

**Phase 4 — Turn the guard on, carefully.**
- Set `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` (owner-only) **first** (PR #161 plumbing).
- Flip `LIFECYCLE_GUARD_ENABLED=true`; move a test task into a 🟡 status; confirm exactly
  one escalation lands in `/agency/automation/escalations` (dedup holds) and the
  allowlisted recipient is notified. Roll back = flip the flag off.

**Phase 5 — Unblock C6/C7** as their own slices (out of scope here).

## 7. Reversibility
- Phase 1 is additive (`IF NOT EXISTS`); rollback = delete the seeded `task_statuses` rows
  (none referenced yet) or just leave them (inert).
- Phase 3 remap (if any active-task remap is chosen) writes a `status_id` snapshot table
  first; rollback restores from it.
- Phase 4 is a single env flag — instant off-switch (that's exactly why PR #161 added it).

## 8. Open decisions (need your steer before Phase 1)
1. **Scope** — confirm "ad-ops department/boards only, forward-only" (recommended) vs a
   wider rollout.
2. **Active-task remap** — do we attempt a best-effort remap of *currently-open* ad-ops
   tasks (using board column / position as a hint), or strictly forward-only?
3. **Status set** — seed all ~30 canonical names, or a trimmed set matching how the team
   actually works today (some Monday values may be dead)?
4. **UI source of truth** — confirm whether ad-ops boards use legacy `board_columns` or
   modern `custom_columns` for status (determines where seeding must land).

## 9. Sequencing
Safety PR #161 (kill switch + allowlist) is **prerequisite and already merged**. This
migration is the next gate; it must land + validate **before** `LIFECYCLE_GUARD_ENABLED`
is ever flipped on. C6/C7 follow once stages are live.

---
**Recommended next step:** approve Approach C + the scope in §8.1, and let me run **Phase 0
discovery** (read-only) to produce the concrete board/department + status table, which I'll
bring back before writing any migration SQL.
