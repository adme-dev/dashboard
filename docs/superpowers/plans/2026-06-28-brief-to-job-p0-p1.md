# Brief → Job — P0 (schema reconcile) + P1 (assignment & visibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make brief→project conversion produce **visible, assigned** work: every converted task gets a `department_id` (so it actually appears in the Tasks list / Workflow board) and, where deterministic, an `assignee_id`; the project's manager becomes the brief's owner; assignees are notified. Plus reconcile the duplicate `template_tasks` schema and add an explicit per-task assignee column.

**Architecture:** Pure, unit-tested resolvers (`server/utils/briefConversion/assignment.ts`) decide department + assignee from a template task; `briefConversion.ts` calls them inside its existing transaction and reuses the platform's `notifyTaskAssigned`. Assignment is **deterministic where safe** (explicit template assignee, or `project_manager` role → brief owner, or department from the template) and otherwise left unassigned for the manual fallback — matching the platform's "automation with a human in the loop" model. AI-proposed *person* suggestions for department-only tasks are a later slice (out of scope here).

**Tech Stack:** Nuxt 4 / Nitro, TypeScript, Neon Postgres (`server/utils/db.ts`), Vitest. Notifications via `~~/server/utils/notifications`.

## Background (verified 2026-06-28)

- **Live `template_tasks`** has `default_role varchar(100)`, `default_department_id uuid → departments`, plus `title/description/priority/task_type/estimated_hours/start_day_offset/duration_days/phase_id/sort_order`. It does **not** have the `default_assignee_role` enum that `schema-xeroflow.sql` still declares — that file is stale vs live.
- **`tasks`** has `assignee_id` (person, what the board uses), `department_id`, `reporter_id` (and a legacy `assigned_to` the canonical create path ignores).
- **`task_assignees`** is only for extra roles (reviewer/approver/watcher); the canonical create (`tasks/index.post.ts`) sets `assignee_id` and does **not** write `task_assignees`. We match that — no `task_assignees` writes here.
- **Board visibility bug (G11):** `tasks/index.get.ts:120` and `tasks/index.post.ts:191` **INNER JOIN `departments`**, so a task with `department_id = NULL` is invisible. `briefConversion.ts` sets no `department_id` → converted tasks vanish from the board. P1 must always set a department.
- **`notifyTaskAssigned`** exists in `~~/server/utils/notifications`; canonical usage: `notifyTaskAssigned({ assigneeId, taskId, taskTitle, assignerId, dueDate })`, fired only when `assignee_id !== reporterId`.

## Global Constraints

- Server imports use `~~/server/utils/` (Nitro double-tilde), never `~/server/utils/`.
- Tests are Vitest; run one file with `pnpm exec vitest run <path>`.
- Migrations live in `server/database/migrations/`, are additive + idempotent, and are applied to live Neon via `psql "$DATABASE_URL" -f <file>` (load `DATABASE_URL` from `.env`).
- **Migration numbering:** this branch is off `main` (latest `204`). `205` and `206` are reserved on unmerged sibling branches (`feat/brief-monday-campaign-mapping`, `docs/dealer-feeds-plugin-rnd`), so use **`207`** to avoid a merge collision; bump to the next free integer if taken.
- Assignment is **deterministic-or-unassigned** in this plan: never guess a specific person. Manual assignment in the board remains the fallback. (AI-proposed person suggestions = a later slice.)
- A converted task MUST always get a non-null `department_id` (board visibility). Resolution order: `template_tasks.default_department_id` → brief template `auto_assign_department` → first active department.
- Match the canonical task-create conventions in `tasks/index.post.ts` (set `assignee_id`, not legacy `assigned_to`; notify via `notifyTaskAssigned` when assignee ≠ reporter).

## File structure

- `server/database/migrations/207_template_tasks_default_assignee.sql` — add `template_tasks.default_assignee_id`.
- `server/database/schema-templates.sql`, `server/database/schema-xeroflow.sql` — reconcile to live shape (doc-of-record).
- `server/utils/briefConversion/assignment.ts` — pure resolvers (`pickDepartmentId`, `resolveTaskAssignee`).
- `server/utils/briefConversion.ts` — wire resolvers + PM=owner + department + notify (existing file).
- `test/briefs/assignment.test.ts` — unit tests for the resolvers.
- `scripts/brief-conversion-battletest.ts` (scratch, not committed) — real-DB integration verification for Task 3.

---

### Task 1: P0 — add `template_tasks.default_assignee_id` + reconcile schema files

**Files:**
- Create: `server/database/migrations/207_template_tasks_default_assignee.sql`
- Modify: `server/database/schema-templates.sql` (template_tasks block), `server/database/schema-xeroflow.sql` (template_tasks block)
- Test: verification query (infra task)

**Interfaces:**
- Produces: column `template_tasks.default_assignee_id uuid NULL REFERENCES team_members(id)` — an optional explicit per-task person that Task 2's resolver treats as highest-priority.

- [ ] **Step 1: Write the migration**

```sql
-- 207: explicit per-task default assignee on project-template tasks.
-- The live template_tasks already carries default_role + default_department_id;
-- this adds an optional explicit person so template authors can pin an assignee
-- (the most deterministic path for brief→project conversion). Additive + idempotent.

ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS default_assignee_id uuid REFERENCES team_members(id);
```

- [ ] **Step 2: Apply to live Neon**

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/207_template_tasks_default_assignee.sql
```
Expected: `ALTER TABLE` (no error; re-runnable).

- [ ] **Step 3: Verify the column + FK**

Run:
```bash
psql "$DATABASE_URL" -P pager=off -c "\d template_tasks" | grep -E "default_assignee_id|default_department_id|default_role"
```
Expected: shows `default_assignee_id | uuid`, `default_department_id | uuid`, `default_role | character varying(100)`.

- [ ] **Step 4: Reconcile the schema files to live**

In `server/database/schema-templates.sql` and `server/database/schema-xeroflow.sql`, edit the `template_tasks` definition so both match live: columns include `default_role VARCHAR(100)`, `default_department_id UUID REFERENCES departments(id)`, and the new `default_assignee_id UUID REFERENCES team_members(id)`. Remove the stale `default_assignee_role` enum + its CHECK from `schema-xeroflow.sql` (it does not exist in live). These files are documentation-of-record (not executed); the goal is that a fresh read matches the database.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/207_template_tasks_default_assignee.sql server/database/schema-templates.sql server/database/schema-xeroflow.sql
git commit -m "feat(briefs): template_tasks.default_assignee_id + reconcile template schema to live (P0)"
```

---

### Task 2: P1 — pure assignment resolvers

**Files:**
- Create: `server/utils/briefConversion/assignment.ts`
- Test: `test/briefs/assignment.test.ts`

**Interfaces:**
- Produces:
  - `pickDepartmentId(candidates: Array<string | null | undefined>): string | null` — first non-empty trimmed id, else null.
  - `resolveTaskAssignee(input: { defaultAssigneeId?: string | null; defaultRole?: string | null; projectManagerId: string | null }): { assigneeId: string | null; source: 'explicit' | 'manager' | 'unassigned' }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/briefs/assignment.test.ts
import { describe, it, expect } from 'vitest'
import { pickDepartmentId, resolveTaskAssignee } from '~~/server/utils/briefConversion/assignment'

describe('pickDepartmentId', () => {
  it('returns the first non-empty candidate', () => {
    expect(pickDepartmentId([null, undefined, '', 'dept-2', 'dept-3'])).toBe('dept-2')
  })
  it('trims and skips whitespace-only', () => {
    expect(pickDepartmentId(['  ', 'dept-x'])).toBe('dept-x')
  })
  it('returns null when nothing usable', () => {
    expect(pickDepartmentId([null, undefined, '', '   '])).toBeNull()
  })
})

describe('resolveTaskAssignee', () => {
  it('prefers an explicit default assignee', () => {
    expect(resolveTaskAssignee({ defaultAssigneeId: 'person-1', defaultRole: 'manager', projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: 'person-1', source: 'explicit' })
  })
  it('maps a manager-ish role to the project manager', () => {
    for (const role of ['Project Manager', 'manager', 'PM', 'account lead', 'Lead']) {
      expect(resolveTaskAssignee({ defaultRole: role, projectManagerId: 'pm-9' }))
        .toEqual({ assigneeId: 'pm-9', source: 'manager' })
    }
  })
  it('leaves non-manager roles unassigned (manual fallback — never guesses a person)', () => {
    expect(resolveTaskAssignee({ defaultRole: 'Designer', projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
    expect(resolveTaskAssignee({ defaultRole: null, projectManagerId: 'pm-9' }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
  })
  it('does not invent a PM when none exists', () => {
    expect(resolveTaskAssignee({ defaultRole: 'manager', projectManagerId: null }))
      .toEqual({ assigneeId: null, source: 'unassigned' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/briefs/assignment.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/briefConversion/assignment`.

- [ ] **Step 3: Write `assignment.ts`**

```ts
// server/utils/briefConversion/assignment.ts
// Pure resolvers for brief→project task assignment. Deterministic-or-unassigned:
// never guess a specific person — manual assignment in the board is the fallback.

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** First usable id from the candidate list (template dept → brief dept → fallback). */
export function pickDepartmentId(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const v = clean(c)
    if (v) return v
  }
  return null
}

// A template task's free-text role counts as "the manager" when it names a PM/lead.
const MANAGER_ROLE = /\b(project\s*manager|manager|pm|lead|account\s*lead)\b/i

export interface ResolveAssigneeInput {
  defaultAssigneeId?: string | null
  defaultRole?: string | null
  projectManagerId: string | null
}

export function resolveTaskAssignee(
  input: ResolveAssigneeInput,
): { assigneeId: string | null; source: 'explicit' | 'manager' | 'unassigned' } {
  const explicit = clean(input.defaultAssigneeId)
  if (explicit) return { assigneeId: explicit, source: 'explicit' }

  const role = clean(input.defaultRole)
  const pm = clean(input.projectManagerId)
  if (role && pm && MANAGER_ROLE.test(role)) return { assigneeId: pm, source: 'manager' }

  return { assigneeId: null, source: 'unassigned' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/briefs/assignment.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Commit**

```bash
git add server/utils/briefConversion/assignment.ts test/briefs/assignment.test.ts
git commit -m "feat(briefs): pure department + assignee resolvers for conversion (P1)"
```

---

### Task 3: P1 — wire resolvers into `briefConversion.ts` (PM=owner, department, assignee, notify)

**Files:**
- Modify: `server/utils/briefConversion.ts`
- Verify: `scripts/brief-conversion-battletest.ts` (scratch; real-DB integration, cleaned up)

**Interfaces:**
- Consumes: `pickDepartmentId`, `resolveTaskAssignee` (Task 2); `notifyTaskAssigned` from `~~/server/utils/notifications`.
- Behaviour after this task: `convertBriefToProject` sets `projects.project_manager_id` to the brief's owner; every created task gets a non-null `department_id` and (where deterministic) an `assignee_id`; assignees ≠ converter are notified.

- [ ] **Step 1: Extend imports + the brief SELECT**

At the top of `server/utils/briefConversion.ts`, add imports:
```ts
import { pickDepartmentId, resolveTaskAssignee } from '~~/server/utils/briefConversion/assignment'
import { notifyTaskAssigned } from '~~/server/utils/notifications'
```

Change the brief SELECT (currently `briefConversion.ts:27-37`) to also pull the owner + the brief template's routing department:
```ts
  const brief = await queryOne(`
    SELECT
      b.id, b.title, b.client_id, b.status, b.converted_to_project_id,
      b.requested_deadline, b.budget_min, b.budget_max, b.budget_currency,
      b.quote_id, b.assigned_to,
      bt.project_template_id AS template_project_template_id,
      bt.field_mapping, bt.auto_convert_on_approval, bt.auto_assign_department
    FROM briefs b
    JOIN brief_templates bt ON b.template_id = bt.id
    WHERE b.id = $1
  `, [briefId])
```

- [ ] **Step 2: Set the project manager to the brief owner**

In the template-based branch, change the project INSERT's `project_manager_id` param (currently `userId` at `briefConversion.ts:111`) to prefer the brief owner:
```ts
        brief.assigned_to || userId
```
Apply the same change to the no-template branch's project INSERT (`briefConversion.ts:238`) — pass `brief.assigned_to || userId` for `project_manager_id`. (The no-template branch currently has fixed columns; add `project_manager_id` value accordingly — it already passes `userId` as the last param, so swap to `brief.assigned_to || userId`.)

- [ ] **Step 3: Resolve a fallback department once, before the task loop**

Inside the transaction, after `const templateTasks = tasksResult.rows` (`briefConversion.ts:121`), add:
```ts
      // Department fallback chain so every task is board-visible (tasks list INNER JOINs departments).
      const fallbackDeptResult = await txClient.query(
        `SELECT id FROM departments WHERE is_active = true ORDER BY sort_order NULLS LAST, created_at LIMIT 1`,
      )
      const fallbackDeptId: string | null = fallbackDeptResult.rows[0]?.id ?? null
      const projectManagerId: string | null = brief.assigned_to || userId
      const assignedForNotify: Array<{ taskId: string; assigneeId: string; title: string; dueDate: string }> = []
```

- [ ] **Step 4: Set `department_id` + `assignee_id` on each task INSERT**

Replace the task INSERT (`briefConversion.ts:167-188`) with one that resolves + sets department and assignee, and records assignments to notify:
```ts
        const departmentId = pickDepartmentId([
          tt.default_department_id,
          brief.auto_assign_department,
          fallbackDeptId,
        ])
        const { assigneeId } = resolveTaskAssignee({
          defaultAssigneeId: tt.default_assignee_id,
          defaultRole: tt.default_role,
          projectManagerId,
        })
        const dueDateStr = dueDate.toISOString().split('T')[0]

        const insertedTask = await txClient.query(`
          INSERT INTO tasks (
            project_id, department_id, title, description, priority,
            task_type, estimated_hours, due_date, reporter_id, assignee_id,
            brief_id, budget_source, quote_line_item_id,
            estimated_cost, billing_rate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `, [
          project.id,
          departmentId,
          tt.title,
          tt.description,
          tt.priority || 'medium',
          tt.task_type || 'task',
          tt.estimated_hours,
          dueDateStr,
          userId,
          assigneeId,
          briefId,
          budgetSource,
          matchedLineItemId,
          estimatedCost,
          billingRate,
        ])
        tasksCreated++

        if (assigneeId && assigneeId !== userId) {
          assignedForNotify.push({ taskId: insertedTask.rows[0].id, assigneeId, title: tt.title, dueDate: dueDateStr })
        }
```

- [ ] **Step 5: Notify assignees after the transaction commits**

Immediately before `return result` (after the `transaction(...)` call returns, ~`briefConversion.ts:220`), the transaction callback should return `assignedForNotify` alongside its result. Change the callback's return to:
```ts
      return { project: { id: project.id, name: project.name }, tasksCreated, assignedForNotify }
```
and after the transaction resolves, fire notifications (fire-and-forget, matching `tasks/index.post.ts`):
```ts
    for (const a of result.assignedForNotify) {
      notifyTaskAssigned({
        assigneeId: a.assigneeId,
        taskId: a.taskId,
        taskTitle: a.title,
        assignerId: userId,
        dueDate: a.dueDate,
      }).catch(err => console.error('[Brief] task-assigned notify failed:', err))
    }
    return { project: result.project, tasksCreated: result.tasksCreated }
```
(`ConvertBriefResult` is unchanged — `assignedForNotify` is internal.)

- [ ] **Step 6: Write the integration battle test (real DB, cleaned up)**

Create `scripts/brief-conversion-battletest.ts` (scratch, not committed) that, against live Neon: creates a temp department (if needed), a temp project_template + one template_task with a `default_department_id` and a `default_role='Project Manager'`, a temp brief (status `approved`, `assigned_to` = a real team member), runs `convertBriefToProject`, then asserts: (a) the project's `project_manager_id` = the brief owner; (b) the created task has a non-null `department_id`; (c) the manager-role task's `assignee_id` = the brief owner; (d) the task is returned by the board query (`tasks` INNER JOIN `departments`). Tear everything down in a `finally`. Run with:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/brief-conversion-battletest.ts
```
Expected: all assertions pass; teardown leaves 0 temp rows.

- [ ] **Step 7: Run the resolver unit tests + commit**

Run: `pnpm exec vitest run test/briefs/assignment.test.ts` → PASS.
```bash
git add server/utils/briefConversion.ts
git commit -m "feat(briefs): conversion sets project owner + task department & assignee + notifies (P1, fixes board visibility)"
```

---

## Self-review (against the gap doc)

- **Spec coverage:** G11 board-visibility (department on every task) → Task 3 Step 3-4 ✅ · G1 task assignment (deterministic) → Task 2 + Task 3 Step 4 ✅ · G2 project owner → Task 3 Step 2 ✅ · G5 (partial) assignee notification → Task 3 Step 5 ✅ · G7 role resolver → Task 2 ✅ · G8 schema reconcile → Task 1 ✅. **Out of scope here (later phases):** G3 `field_mapping` revive (P2), G4 deadline/budget surfacing (P2), G6 status alert (P4), G9 UI rollup (P5), G10 swallowed-failure surfacing (P3), AI-proposed *person* suggestions for department-only tasks.
- **Placeholder scan:** none — exact SQL/TS/commands throughout.
- **Type consistency:** `pickDepartmentId` / `resolveTaskAssignee` signatures match between Task 2 and Task 3; `notifyTaskAssigned` call shape matches `tasks/index.post.ts`; new INSERT column/param counts align (15/15).

## Notes / risks

- `briefConversion.ts` uses `transaction()` inline and isn't cleanly unit-mockable, so Task 3 is verified by the real-DB battle test (Step 6) rather than a vitest unit — the *logic* it depends on (resolvers) is unit-tested in Task 2.
- Department fallback picks the first active department when neither the template task nor the brief template specifies one; confirm that default is acceptable, or seed a dedicated "Unassigned/General" department.
- `assignee_id` only — no `task_assignees` rows (matches canonical create). `task_assignees` (reviewer/approver) is out of scope.
- Deterministic-only assignment by design: department-only tasks stay unassigned (manual fallback). The AI-proposed person suggestion is the next slice; the resolver already returns a `source` to drive it later.
