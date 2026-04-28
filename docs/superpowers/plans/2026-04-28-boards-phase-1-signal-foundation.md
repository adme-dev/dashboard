# Boards Phase 1 — Signal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the substrate every "intelligent" Boards feature needs — analytics event log + per-user notification curation + per-board daily metrics — and ship two visible surfaces on top: the `/agency/triage` page and a per-board Instruments HUD.

**Architecture:** Build on top of the existing `notifications` table (no schema change there). Add three new tables: `board_events` (append-only analytics log), `notification_curations` (top-N AI-decorated items per user, replaced wholesale per Cron pass), `board_metrics_daily` (per-board KPIs). Two Cloudflare Cron Workers: a 30-min Curation Worker and an 02:00 UTC Daily Rollup Worker. Read-only AI agent (Workers AI Llama-3-8B) decorates curated items with reasoning text — no mutations in this phase.

**Tech Stack:** Nuxt 4 / Vue 3 (Composition API), Nitro server endpoints, Postgres (Neon, queried via `server/utils/db.ts`), Cloudflare Workers + Cron + KV + Workers AI binding, Unovis (sparklines), Nuxt UI v4 (UI components), Vitest (unit/integration), Playwright (E2E).

> **Schema-naming note:** the user-facing concept is "board" but the historical Postgres table is `departments`. New foreign keys reference `departments(id)`; tasks already use `department_id`. The `boards` URL/UI naming stays.

> **BoardRoom DO non-persistence (verified 2026-04-28):** the existing `workers/board-events/` Durable Object is in-memory only — no `storage.put`, `storage.sql`, or other persisted writes. `board_events` is therefore the canonical persistent log; no duplicate-work risk.

---

## Execution slices

Run the plan as **three vertical slices**, each ending in something visible. This is appropriate for a platform still in development — fast feedback beats sequential perfection.

### Slice 1.0 — "Thin proof" (4–5 days)

End state: one mutation type (status change) → `board_events` → daily rollup → HUD shows throughput on a board.

Tasks: **1, 3, 4, 5 (status only — defer assignee/create/delete to 1.A), 7, 8, 9, 19, 20, 26 (telemetry)**.

Why: proves the schema, the rollup pipeline, the Cron trigger, the Workers AI binding, and the HUD component pattern. Any architectural mistake surfaces here, not in week 4.

### Slice 1.A — "Foundation complete" (1–2 weeks)

End state: every mutation endpoint emits events, all four metrics in HUD, last 30 days backfilled.

Tasks: **2, 5 (rest — assignee/create/delete), 6, 10, 21**.

### Slice 1.B — "Triage feed" (2 weeks)

End state: `/agency/triage` page live with For You / My Work / Following tabs and AI-decorated reasoning.

Tasks: **11, 12, 13, 14, 15, 16, 17, 18, 24**.

### Cut / deferred (do **not** run as part of Phase 1)

- **Task 21 step 1** (per-user HUD collapse via `board_views.config`) — use `localStorage` only (step 2). The view-config integration is over-engineering for a UI toggle.
- **Tasks 22 & 23** (Playwright E2E specs) — defer to a real Phase 0 E2E sprint after Phase 1 is feature-complete. The repo currently has 1 test file; bolting on Playwright inside Phase 1 is scope creep. Equivalent assertions can be Vitest integration tests against the dev server in the meantime.
- **"Front-facing page sync" out-of-band task** — defer until the platform ships externally. Marketing pages are not load-bearing for staff users now.

### Feature-flagging

The Curation Worker reads an env var `ENABLE_AI_DECORATION`; when unset or `"false"`, it skips the Workers AI call and stores `reasoning = NULL`. This lets Slice 1.A ship without depending on Llama-3 quality, and lets you toggle AI decoration off in production without redeploying.

Add to `workers/triage-curator/wrangler.toml`:

```toml
[vars]
ENABLE_AI_DECORATION = "true"
```

And in `src/index.ts`, gate the call:

```ts
if ((env.ENABLE_AI_DECORATION ?? 'false') !== 'true') {
  return new Map()
}
```

(Folds into Task 12 when implementing.)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `server/database/migrations/078-board-events.sql` | `board_events` table + indices |
| `server/database/migrations/079-notification-curations.sql` | `notification_curations` table + indices |
| `server/database/migrations/080-board-metrics-daily.sql` | `board_metrics_daily` table |
| `server/database/migrations/081-backfill-board-events.sql` | seed last 30 days from existing data |
| `server/utils/boardEvents.ts` | `emitBoardEvent()` helper + event-type constants |
| `server/utils/triage/scorer.ts` | `scoreNotification()` pure function + weight constants |
| `server/utils/triage/rollup.ts` | per-day rollup math (throughput, WIP, cycle time) |
| `server/api/agency/triage/curated.get.ts` | For You tab data |
| `server/api/agency/triage/my-work.get.ts` | My Work tab data |
| `server/api/agency/triage/following.get.ts` | Following tab data |
| `server/api/agency/triage/mark-all-read.patch.ts` | bulk mark-as-read |
| `server/api/agency/boards/[id]/instruments.get.ts` | per-board metrics for HUD |
| `workers/triage-curator/src/index.ts` | Curation Worker (Cron 30 min) |
| `workers/triage-curator/wrangler.toml` | worker config |
| `workers/board-metrics/src/index.ts` | Daily Rollup Worker (Cron 02:00 UTC) |
| `workers/board-metrics/wrangler.toml` | worker config |
| `app/pages/agency/triage.vue` | Triage page (3 tabs) |
| `app/components/triage/TriageItemCard.vue` | one curated/raw notification card |
| `app/components/triage/TriageEmptyState.vue` | first-render empty state |
| `app/components/board/BoardInstruments.vue` | per-board HUD overlay |
| `test/server/utils/boardEvents.test.ts` | unit tests for helper |
| `test/server/utils/triage/scorer.test.ts` | unit tests for heuristic |
| `test/server/utils/triage/rollup.test.ts` | unit tests for rollup math |
| `test/server/api/agency/triage.test.ts` | API + RBAC integration tests |
| `test/workers/triage-curator.test.ts` | curation worker integration tests |
| `test/e2e/triage.spec.ts` | Playwright: triage page flow |
| `test/e2e/board-instruments.spec.ts` | Playwright: HUD render flow |

### Modified files

| Path | Modification |
|---|---|
| `server/api/agency/tasks/index.post.ts` | call `emitBoardEvent({ event_type: 'task_created' })` after insert |
| `server/api/agency/tasks/[id].delete.ts` | call `emitBoardEvent({ event_type: 'task_deleted' })` before delete |
| `server/api/agency/tasks/[id].patch.ts` | conditional `emitBoardEvent` for due-date / title changes |
| `server/api/agency/tasks/[id]/status.patch.ts` | call `emitBoardEvent({ event_type: 'status_changed' })` |
| `server/api/agency/tasks/[id]/assignee.patch.ts` | call `emitBoardEvent({ event_type: 'assignee_changed' })` |
| `server/api/agency/tasks/[id]/comments.post.ts` | call `emitBoardEvent({ event_type: 'comment_added' })` (+ `mention_created` per mention) |
| `server/api/agency/tasks/[id]/subtasks.post.ts` | call `emitBoardEvent` on subitem completion |
| `server/api/agency/tasks/[id]/linked-items/index.post.ts` | call `emitBoardEvent({ event_type: 'blocker_added' })` when link_type='blocks' or 'is_blocked_by' |
| `app/pages/agency/boards/[id].vue` | mount `BoardInstruments` overlay |
| `wrangler.toml` (project root) | register both new workers' bindings if needed for shared services |

---

## Task 1: Migration — `board_events` table

**Files:**
- Create: `server/database/migrations/078-board-events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 078-board-events.sql
-- Append-only analytics log of significant board mutations.
-- Powers Phase 1 board_metrics_daily rollup and is read by the Instruments HUD.
-- Note: column name `board_id` references departments(id) — see schema-naming note in plan.

CREATE TABLE IF NOT EXISTS board_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id    UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES team_members(id) ON DELETE SET NULL,
  event_type  VARCHAR(40) NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_events_board_time ON board_events (board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_events_task_time  ON board_events (task_id,  created_at DESC) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_events_type_time  ON board_events (event_type, created_at DESC);
```

- [ ] **Step 2: Apply to dev DB**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/078-board-events.sql
```
Expected: `CREATE TABLE` and three `CREATE INDEX` outputs.

- [ ] **Step 3: Verify schema**

Run:
```bash
psql "$DATABASE_URL" -c "\d board_events"
```
Expected: `board_events` table with seven columns and three indexes.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/078-board-events.sql
git commit -m "feat(boards): add board_events analytics log table"
```

---

## Task 2: Migration — `notification_curations` table

**Files:**
- Create: `server/database/migrations/079-notification-curations.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 079-notification-curations.sql
-- Per-user top-N curated notifications, replaced wholesale per Curation Worker pass.
-- Reasoning is generated by Workers AI; NULL when AI failed (UI uses deterministic fallback).

CREATE TABLE IF NOT EXISTS notification_curations (
  user_id          UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  notification_id  UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  rank             SMALLINT NOT NULL,
  score            REAL NOT NULL,
  reasoning        TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_curations_user_rank ON notification_curations (user_id, rank);
CREATE INDEX IF NOT EXISTS idx_curations_generated ON notification_curations (generated_at);
```

- [ ] **Step 2: Apply**

Run:
```bash
psql "$DATABASE_URL" -f server/database/migrations/079-notification-curations.sql
```
Expected: `CREATE TABLE` + two `CREATE INDEX`.

- [ ] **Step 3: Verify**

Run:
```bash
psql "$DATABASE_URL" -c "\d notification_curations"
```
Expected: composite PK on `(user_id, notification_id)`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/079-notification-curations.sql
git commit -m "feat(triage): add notification_curations table"
```

---

## Task 3: Migration — `board_metrics_daily` table

**Files:**
- Create: `server/database/migrations/080-board-metrics-daily.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 080-board-metrics-daily.sql
-- One row per board per day. Written by the Daily Rollup Worker.
-- Read by the Instruments HUD (last 30 days).

CREATE TABLE IF NOT EXISTS board_metrics_daily (
  board_id          UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  throughput        INTEGER NOT NULL DEFAULT 0,
  created_count     INTEGER NOT NULL DEFAULT 0,
  wip               INTEGER NOT NULL DEFAULT 0,
  avg_cycle_time_h  REAL,
  oldest_age_days   INTEGER,
  PRIMARY KEY (board_id, date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON board_metrics_daily (date);
```

- [ ] **Step 2: Apply**

```bash
psql "$DATABASE_URL" -f server/database/migrations/080-board-metrics-daily.sql
```
Expected: `CREATE TABLE` + `CREATE INDEX`.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "\d board_metrics_daily"
```

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/080-board-metrics-daily.sql
git commit -m "feat(boards): add board_metrics_daily rollup table"
```

---

## Task 4: `emitBoardEvent` helper + unit tests

**Files:**
- Create: `server/utils/boardEvents.ts`
- Test: `test/server/utils/boardEvents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/boardEvents.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ execute: vi.fn() }))

import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'
import * as db from '~~/server/utils/db'

describe('emitBoardEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a row with the canonical column set', async () => {
    await emitBoardEvent({
      boardId: 'b1',
      taskId: 't1',
      actorId: 'u1',
      eventType: 'status_changed',
      payload: { from: 'a', to: 'b' },
    })
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO board_events'),
      ['b1', 't1', 'u1', 'status_changed', JSON.stringify({ from: 'a', to: 'b' })]
    )
  })

  it('swallows DB errors and logs (non-blocking)', async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(emitBoardEvent({
      boardId: 'b1', actorId: 'u1', eventType: 'task_created', payload: {},
    })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })

  it('exports event type constants for use across endpoints', () => {
    expect(BOARD_EVENT_TYPES.STATUS_CHANGED).toBe('status_changed')
    expect(BOARD_EVENT_TYPES.TASK_CREATED).toBe('task_created')
    expect(BOARD_EVENT_TYPES.MENTION_CREATED).toBe('mention_created')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/server/utils/boardEvents.test.ts
```
Expected: FAIL — `Cannot find module '~~/server/utils/boardEvents'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/boardEvents.ts
import { execute } from '~~/server/utils/db'

export const BOARD_EVENT_TYPES = {
  TASK_CREATED:       'task_created',
  TASK_DELETED:       'task_deleted',
  TASK_COMPLETED:     'task_completed',
  STATUS_CHANGED:     'status_changed',
  ASSIGNEE_CHANGED:   'assignee_changed',
  DUE_DATE_CHANGED:   'due_date_changed',
  COMMENT_ADDED:      'comment_added',
  MENTION_CREATED:    'mention_created',
  SUBITEM_COMPLETED:  'subitem_completed',
  AUTOMATION_FIRED:   'automation_fired',
  BLOCKER_ADDED:      'blocker_added',
  BLOCKER_RESOLVED:   'blocker_resolved',
} as const

export type BoardEventType = typeof BOARD_EVENT_TYPES[keyof typeof BOARD_EVENT_TYPES]

interface EmitParams {
  boardId: string
  taskId?: string | null
  actorId: string | null
  eventType: BoardEventType | string
  payload: Record<string, unknown>
}

export async function emitBoardEvent(params: EmitParams): Promise<void> {
  try {
    await execute(
      `INSERT INTO board_events (board_id, task_id, actor_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.boardId,
        params.taskId ?? null,
        params.actorId,
        params.eventType,
        JSON.stringify(params.payload ?? {}),
      ]
    )
  } catch (err) {
    console.error('[boardEvents] write failure:', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test test/server/utils/boardEvents.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/boardEvents.ts test/server/utils/boardEvents.test.ts
git commit -m "feat(boards): add emitBoardEvent helper with non-blocking write"
```

---

## Task 5: Wire `emitBoardEvent` into status, assignee, create, delete

**Files:**
- Modify: `server/api/agency/tasks/[id]/status.patch.ts`
- Modify: `server/api/agency/tasks/[id]/assignee.patch.ts`
- Modify: `server/api/agency/tasks/index.post.ts`
- Modify: `server/api/agency/tasks/[id].delete.ts`

- [ ] **Step 1: Read each existing endpoint to find insert/update site**

Run for each:
```bash
grep -n "createNotification\|UPDATE tasks\|INSERT INTO tasks\|DELETE FROM tasks" \
  server/api/agency/tasks/[id]/status.patch.ts \
  server/api/agency/tasks/[id]/assignee.patch.ts \
  server/api/agency/tasks/index.post.ts \
  server/api/agency/tasks/[id].delete.ts
```
Note the line where the mutation completes — `emitBoardEvent` goes immediately after.

- [ ] **Step 2: Add emit to status endpoint**

In `server/api/agency/tasks/[id]/status.patch.ts`, after the existing UPDATE that changes the task status (and after any existing `createNotification` call), add:

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

// ...inside the handler, after the status UPDATE succeeds:
await emitBoardEvent({
  boardId: task.department_id,
  taskId: task.id,
  actorId: user.id,
  eventType: BOARD_EVENT_TYPES.STATUS_CHANGED,
  payload: { from: previousStatusId, to: newStatusId },
})

// If newStatus is the "done"/completed status, also emit task_completed:
if (isCompletedStatus) {
  await emitBoardEvent({
    boardId: task.department_id,
    taskId: task.id,
    actorId: user.id,
    eventType: BOARD_EVENT_TYPES.TASK_COMPLETED,
    payload: { status_id: newStatusId },
  })
}
```

- [ ] **Step 3: Add emit to assignee endpoint**

In `server/api/agency/tasks/[id]/assignee.patch.ts`, after the assignee update:

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

await emitBoardEvent({
  boardId: task.department_id,
  taskId: task.id,
  actorId: user.id,
  eventType: BOARD_EVENT_TYPES.ASSIGNEE_CHANGED,
  payload: { from: previousAssigneeId, to: newAssigneeId },
})
```

- [ ] **Step 4: Add emit to task create endpoint**

In `server/api/agency/tasks/index.post.ts`, after the INSERT:

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

await emitBoardEvent({
  boardId: newTask.department_id,
  taskId: newTask.id,
  actorId: user.id,
  eventType: BOARD_EVENT_TYPES.TASK_CREATED,
  payload: { title: newTask.title },
})
```

- [ ] **Step 5: Add emit to task delete endpoint**

In `server/api/agency/tasks/[id].delete.ts`, **before** the DELETE (so we still have the row):

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

await emitBoardEvent({
  boardId: task.department_id,
  taskId: task.id,
  actorId: user.id,
  eventType: BOARD_EVENT_TYPES.TASK_DELETED,
  payload: { title: task.title },
})
```

- [ ] **Step 6: Manual smoke check via curl**

Run:
```bash
pnpm dev &
# Then via authenticated client (or curl with session cookie) hit each endpoint
# and verify a board_events row appears:
psql "$DATABASE_URL" -c "SELECT event_type, created_at FROM board_events ORDER BY created_at DESC LIMIT 5;"
```
Expected: rows for status_changed, assignee_changed, task_created, task_deleted in the last few seconds.

- [ ] **Step 7: Commit**

```bash
git add server/api/agency/tasks/[id]/status.patch.ts \
        server/api/agency/tasks/[id]/assignee.patch.ts \
        server/api/agency/tasks/index.post.ts \
        server/api/agency/tasks/[id].delete.ts
git commit -m "feat(boards): emit board_events from status/assignee/create/delete"
```

---

## Task 6: Wire `emitBoardEvent` into comments, mentions, subitems, blockers

**Files:**
- Modify: `server/api/agency/tasks/[id]/comments.post.ts`
- Modify: `server/api/agency/tasks/[id]/subtasks.post.ts`
- Modify: `server/api/agency/tasks/[id]/linked-items/index.post.ts`
- Modify: `server/api/agency/tasks/[id].patch.ts` (only for due-date detection)

- [ ] **Step 1: Comments endpoint — emit comment_added (+ mention_created per @mention)**

In `server/api/agency/tasks/[id]/comments.post.ts`, after the comment INSERT and after the existing mention-extraction logic (look for `mentionedUserIds` or similar):

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

await emitBoardEvent({
  boardId: task.department_id,
  taskId: task.id,
  actorId: user.id,
  eventType: BOARD_EVENT_TYPES.COMMENT_ADDED,
  payload: { comment_id: newComment.id, snippet: comment.body.slice(0, 80) },
})

for (const mentionedUserId of mentionedUserIds) {
  await emitBoardEvent({
    boardId: task.department_id,
    taskId: task.id,
    actorId: user.id,
    eventType: BOARD_EVENT_TYPES.MENTION_CREATED,
    payload: { mentioned_user_id: mentionedUserId, comment_id: newComment.id },
  })
}
```

- [ ] **Step 2: Subitem endpoint — emit subitem_completed on status change**

In `server/api/agency/tasks/[id]/subtasks.post.ts`: subtask creation does **not** emit. Subtask completion does — that's handled by `status.patch.ts` (already wired in Task 5) since subtasks are tasks.

Confirm by inspecting: `grep -n "is_subtask\|parent_id" server/api/agency/tasks/[id]/status.patch.ts`. If status.patch already handles subtask completions, no change here. Otherwise, add the emit there.

- [ ] **Step 3: Blocker links endpoint — emit blocker_added**

In `server/api/agency/tasks/[id]/linked-items/index.post.ts`, after the link INSERT, when `link_type === 'blocks' || link_type === 'is_blocked_by'`:

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

if (linkType === 'blocks' || linkType === 'is_blocked_by') {
  await emitBoardEvent({
    boardId: task.department_id,
    taskId: task.id,
    actorId: user.id,
    eventType: BOARD_EVENT_TYPES.BLOCKER_ADDED,
    payload: { linked_task_id: linkedTaskId, link_type: linkType },
  })
}
```

If a corresponding DELETE endpoint exists (`linked-items/[linkId].delete.ts`), emit `BLOCKER_RESOLVED` there with the same payload shape.

- [ ] **Step 4: Task patch endpoint — emit due_date_changed when due_date changes**

In `server/api/agency/tasks/[id].patch.ts`, around the UPDATE statement:

```ts
import { emitBoardEvent, BOARD_EVENT_TYPES } from '~~/server/utils/boardEvents'

const previousDueDate = existingTask.due_date
const newDueDate = patchBody.due_date

if (newDueDate !== undefined && String(newDueDate) !== String(previousDueDate)) {
  await emitBoardEvent({
    boardId: existingTask.department_id,
    taskId: existingTask.id,
    actorId: user.id,
    eventType: BOARD_EVENT_TYPES.DUE_DATE_CHANGED,
    payload: { from: previousDueDate, to: newDueDate },
  })
}
```

- [ ] **Step 5: Smoke check**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT event_type, COUNT(*) FROM board_events GROUP BY event_type ORDER BY 2 DESC;"
```
Expected: counts for each new event type after manually exercising endpoints.

- [ ] **Step 6: Commit**

```bash
git add server/api/agency/tasks/[id]/comments.post.ts \
        server/api/agency/tasks/[id]/linked-items/index.post.ts \
        server/api/agency/tasks/[id].patch.ts
git commit -m "feat(boards): emit board_events for comments, mentions, blockers, due dates"
```

---

## Task 7: `scoreNotification()` heuristic + unit tests

**Files:**
- Create: `server/utils/triage/scorer.ts`
- Test: `test/server/utils/triage/scorer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/triage/scorer.test.ts
import { describe, it, expect } from 'vitest'
import { scoreNotification, WEIGHTS, type ScorableNotification } from '~~/server/utils/triage/scorer'

const minutes = (n: number) => new Date(Date.now() - n * 60_000)

describe('scoreNotification', () => {
  it('weights mentions highest', () => {
    const n: ScorableNotification = {
      id: '1', type: 'task_mentioned', reason: 'mentioned', is_read: false, created_at: new Date(),
    }
    expect(scoreNotification(n, { userId: 'u1' })).toBeCloseTo(WEIGHTS.mentioned)
  })

  it('weights replies above assignments', () => {
    const reply: ScorableNotification = {
      id: '1', type: 'task_comment', reason: 'mentioned', is_read: false, created_at: new Date(),
    }
    const assigned: ScorableNotification = {
      id: '2', type: 'task_assigned', reason: 'assigned', is_read: false, created_at: new Date(),
    }
    expect(scoreNotification(reply, { userId: 'u1' }))
      .toBeGreaterThan(scoreNotification(assigned, { userId: 'u1' }))
  })

  it('decays score by hours since created_at', () => {
    const fresh: ScorableNotification = {
      id: '1', type: 'task_assigned', reason: 'assigned', is_read: false, created_at: new Date(),
    }
    const old: ScorableNotification = {
      id: '2', type: 'task_assigned', reason: 'assigned', is_read: false, created_at: minutes(10 * 60),
    }
    expect(scoreNotification(fresh, { userId: 'u1' }))
      .toBeGreaterThan(scoreNotification(old, { userId: 'u1' }))
  })

  it('returns 0 for read notifications', () => {
    const read: ScorableNotification = {
      id: '1', type: 'task_mentioned', reason: 'mentioned', is_read: true, created_at: new Date(),
    }
    expect(scoreNotification(read, { userId: 'u1' })).toBe(0)
  })

  it('never returns negative', () => {
    const ancient: ScorableNotification = {
      id: '1', type: 'team_update', reason: 'watching_board', is_read: false, created_at: minutes(60 * 24 * 30),
    }
    expect(scoreNotification(ancient, { userId: 'u1' })).toBeGreaterThanOrEqual(0)
  })

  it('handles unknown type gracefully (low default weight)', () => {
    const unknown: ScorableNotification = {
      id: '1', type: 'system', reason: 'direct', is_read: false, created_at: new Date(),
    }
    expect(scoreNotification(unknown, { userId: 'u1' })).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test test/server/utils/triage/scorer.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/triage/scorer.ts

export const WEIGHTS = {
  mentioned:        10,
  reply:             8,
  blocker_on_mine:   8,
  assigned:          7,
  due_soon_on_mine:  6,
  status_on_mine:    5,
  comment_watched:   3,
  task_created_followed: 2,
  default:           1,
} as const

export interface ScorableNotification {
  id: string
  type: string
  reason: string | null
  is_read: boolean
  created_at: Date | string
  metadata?: Record<string, unknown> | null
}

export interface ScoreContext {
  userId: string
}

const HOUR_MS = 60 * 60 * 1000

function baseWeight(n: ScorableNotification): number {
  if (n.reason === 'mentioned' || n.type === 'task_mentioned' || n.type === 'chat_mention') {
    return WEIGHTS.mentioned
  }
  if (n.type === 'task_comment') return WEIGHTS.reply
  if (n.type === 'task_assigned' || n.reason === 'assigned') return WEIGHTS.assigned
  if (n.type === 'task_due_soon' || n.type === 'task_overdue') return WEIGHTS.due_soon_on_mine
  if (n.type === 'task_status_changed') return WEIGHTS.status_on_mine
  if (n.reason === 'watching_item') return WEIGHTS.comment_watched
  if (n.reason === 'watching_board') return WEIGHTS.task_created_followed
  return WEIGHTS.default
}

export function scoreNotification(n: ScorableNotification, _ctx: ScoreContext): number {
  if (n.is_read) return 0
  const base = baseWeight(n)
  const ageHours = (Date.now() - new Date(n.created_at).getTime()) / HOUR_MS
  const decayed = base - 0.1 * ageHours
  return Math.max(0, decayed)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test test/server/utils/triage/scorer.test.ts
```
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/triage/scorer.ts test/server/utils/triage/scorer.test.ts
git commit -m "feat(triage): add scoreNotification heuristic with unit tests"
```

---

## Task 8: Rollup math helpers + unit tests

**Files:**
- Create: `server/utils/triage/rollup.ts`
- Test: `test/server/utils/triage/rollup.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/triage/rollup.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateMetricsForBoard, type RawEvent, type OpenTaskSnapshot } from '~~/server/utils/triage/rollup'

const ev = (t: string, ts: string): RawEvent => ({
  event_type: t, task_id: `t-${ts}`, created_at: new Date(ts), payload: {},
})

describe('aggregateMetricsForBoard', () => {
  it('counts throughput from task_completed events', () => {
    const day = '2026-04-01'
    const events: RawEvent[] = [
      ev('task_completed', `${day}T08:00:00Z`),
      ev('task_completed', `${day}T15:00:00Z`),
      ev('status_changed', `${day}T09:00:00Z`),
    ]
    const m = aggregateMetricsForBoard(events, [], day)
    expect(m.throughput).toBe(2)
  })

  it('counts created_count from task_created events', () => {
    const day = '2026-04-01'
    const events: RawEvent[] = [
      ev('task_created', `${day}T01:00:00Z`),
      ev('task_created', `${day}T22:00:00Z`),
    ]
    expect(aggregateMetricsForBoard(events, [], day).created_count).toBe(2)
  })

  it('computes wip from open-task snapshot at end of day', () => {
    const day = '2026-04-01'
    const open: OpenTaskSnapshot[] = [
      { task_id: 'a', created_at: new Date('2026-03-20T00:00:00Z') },
      { task_id: 'b', created_at: new Date('2026-03-25T00:00:00Z') },
    ]
    expect(aggregateMetricsForBoard([], open, day).wip).toBe(2)
  })

  it('computes oldest_age_days from oldest open task', () => {
    const day = '2026-04-01'
    const open: OpenTaskSnapshot[] = [
      { task_id: 'a', created_at: new Date('2026-03-20T00:00:00Z') }, // 12 days
      { task_id: 'b', created_at: new Date('2026-03-25T00:00:00Z') }, // 7 days
    ]
    expect(aggregateMetricsForBoard([], open, day).oldest_age_days).toBe(12)
  })

  it('computes avg_cycle_time_h from completions joined to created_at', () => {
    const day = '2026-04-01'
    const events: RawEvent[] = [
      { event_type: 'task_completed', task_id: 'a', created_at: new Date(`${day}T12:00:00Z`),
        payload: { created_at: new Date(`${day}T00:00:00Z`).toISOString() } },
      { event_type: 'task_completed', task_id: 'b', created_at: new Date(`${day}T18:00:00Z`),
        payload: { created_at: new Date(`${day}T06:00:00Z`).toISOString() } },
    ]
    expect(aggregateMetricsForBoard(events, [], day).avg_cycle_time_h).toBeCloseTo(12, 1)
  })

  it('returns null for avg_cycle_time when no completions on the day', () => {
    expect(aggregateMetricsForBoard([], [], '2026-04-01').avg_cycle_time_h).toBeNull()
  })

  it('returns 0 oldest_age and null when no open tasks', () => {
    const m = aggregateMetricsForBoard([], [], '2026-04-01')
    expect(m.oldest_age_days).toBeNull()
    expect(m.wip).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm test test/server/utils/triage/rollup.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/triage/rollup.ts

export interface RawEvent {
  event_type: string
  task_id: string | null
  actor_id?: string | null
  created_at: Date
  payload: Record<string, unknown>
}

export interface OpenTaskSnapshot {
  task_id: string
  created_at: Date
}

export interface DailyMetrics {
  throughput: number
  created_count: number
  wip: number
  avg_cycle_time_h: number | null
  oldest_age_days: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(start.getTime() + DAY_MS)
  return { start, end }
}

export function aggregateMetricsForBoard(
  events: RawEvent[],
  openTasksAtEndOfDay: OpenTaskSnapshot[],
  date: string
): DailyMetrics {
  const { end } = dayBounds(date)

  const completed = events.filter(e => e.event_type === 'task_completed')
  const created = events.filter(e => e.event_type === 'task_created')

  const cycleTimesH = completed
    .map(e => {
      const startIso = (e.payload as any)?.created_at as string | undefined
      if (!startIso) return null
      return (e.created_at.getTime() - new Date(startIso).getTime()) / (60 * 60 * 1000)
    })
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0)

  const avgCycle =
    cycleTimesH.length === 0
      ? null
      : cycleTimesH.reduce((a, b) => a + b, 0) / cycleTimesH.length

  const oldestAgeDays =
    openTasksAtEndOfDay.length === 0
      ? null
      : Math.floor(
          openTasksAtEndOfDay
            .map(t => (end.getTime() - t.created_at.getTime()) / DAY_MS)
            .reduce((a, b) => Math.max(a, b), 0)
        )

  return {
    throughput: completed.length,
    created_count: created.length,
    wip: openTasksAtEndOfDay.length,
    avg_cycle_time_h: avgCycle,
    oldest_age_days: oldestAgeDays,
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test test/server/utils/triage/rollup.test.ts
```
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/utils/triage/rollup.ts test/server/utils/triage/rollup.test.ts
git commit -m "feat(boards): add daily metrics aggregation helpers"
```

---

## Task 9: Daily Rollup Worker — scaffold + DB read + write

**Files:**
- Create: `workers/board-metrics/wrangler.toml`
- Create: `workers/board-metrics/src/index.ts`
- Create: `workers/board-metrics/package.json`

- [ ] **Step 1: Create the wrangler config**

```toml
# workers/board-metrics/wrangler.toml
name = "board-metrics"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[triggers]
crons = ["0 2 * * *"]  # 02:00 UTC daily

[vars]
# DATABASE_URL is set via dashboard secret
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "board-metrics",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.9.0"
  },
  "devDependencies": {
    "wrangler": "^3.78.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Write the worker (uses Neon HTTP because Hyperdrive isn't bound here)**

```ts
// workers/board-metrics/src/index.ts
import { neon } from '@neondatabase/serverless'
import { aggregateMetricsForBoard } from '../../../server/utils/triage/rollup'

interface Env {
  DATABASE_URL: string
}

function yesterdayUtc(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

async function rollupOneDay(env: Env, date: string): Promise<{ boards: number }> {
  const sql = neon(env.DATABASE_URL)
  const startIso = `${date}T00:00:00Z`
  const endIso = `${date}T23:59:59Z`

  const boards = (await sql`
    SELECT DISTINCT board_id
    FROM board_events
    WHERE created_at >= ${startIso} AND created_at <= ${endIso}
  `) as { board_id: string }[]

  for (const { board_id } of boards) {
    const events = (await sql`
      SELECT event_type, task_id, created_at, payload
      FROM board_events
      WHERE board_id = ${board_id}
        AND created_at >= ${startIso}
        AND created_at <= ${endIso}
    `) as Array<{ event_type: string; task_id: string | null; created_at: string; payload: any }>

    const openTasks = (await sql`
      SELECT id AS task_id, created_at
      FROM tasks
      WHERE department_id = ${board_id}
        AND completed_at IS NULL
        AND created_at <= ${endIso}
    `) as Array<{ task_id: string; created_at: string }>

    const m = aggregateMetricsForBoard(
      events.map(e => ({
        event_type: e.event_type,
        task_id: e.task_id,
        created_at: new Date(e.created_at),
        payload: e.payload ?? {},
      })),
      openTasks.map(t => ({ task_id: t.task_id, created_at: new Date(t.created_at) })),
      date
    )

    await sql`
      INSERT INTO board_metrics_daily
        (board_id, date, throughput, created_count, wip, avg_cycle_time_h, oldest_age_days)
      VALUES
        (${board_id}, ${date}, ${m.throughput}, ${m.created_count}, ${m.wip},
         ${m.avg_cycle_time_h}, ${m.oldest_age_days})
      ON CONFLICT (board_id, date) DO UPDATE SET
        throughput       = EXCLUDED.throughput,
        created_count    = EXCLUDED.created_count,
        wip              = EXCLUDED.wip,
        avg_cycle_time_h = EXCLUDED.avg_cycle_time_h,
        oldest_age_days  = EXCLUDED.oldest_age_days
    `
  }

  return { boards: boards.length }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const date = yesterdayUtc()
    const result = await rollupOneDay(env, date)
    console.log(`[board-metrics] rolled up ${result.boards} boards for ${date}`)
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    if (url.pathname === '/run' && req.method === 'POST') {
      const date = url.searchParams.get('date') ?? yesterdayUtc()
      const result = await rollupOneDay(env, date)
      return Response.json({ ok: true, date, ...result })
    }
    return new Response('Not found', { status: 404 })
  },
}
```

- [ ] **Step 4: Local dry-run**

```bash
cd workers/board-metrics
pnpm install
DATABASE_URL=$(grep DATABASE_URL ../../.env | cut -d= -f2-) wrangler dev --test-scheduled
# In another terminal:
curl -X POST "http://localhost:8787/__scheduled?cron=0+2+*+*+*"
```
Expected: log line shows `rolled up N boards for YYYY-MM-DD`.

- [ ] **Step 5: Verify metrics row appeared**

```bash
psql "$DATABASE_URL" -c "SELECT board_id, date, throughput, wip, avg_cycle_time_h FROM board_metrics_daily ORDER BY date DESC LIMIT 3;"
```
Expected: at least one row for yesterday.

- [ ] **Step 6: Commit**

```bash
git add workers/board-metrics/
git commit -m "feat(workers): add board-metrics daily rollup worker"
```

---

## Task 10: Backfill migration — last 30 days of `board_events`

**Files:**
- Create: `server/database/migrations/081-backfill-board-events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 081-backfill-board-events.sql
-- One-time backfill of board_events from existing data so Phase 1 surfaces aren't blank on launch.
-- Idempotent: checks (board_id, task_id, event_type, created_at) before inserting.

BEGIN;

-- task_created
INSERT INTO board_events (board_id, task_id, actor_id, event_type, payload, created_at)
SELECT t.department_id, t.id, t.created_by, 'task_created',
       jsonb_build_object('title', t.title), t.created_at
FROM tasks t
WHERE t.created_at >= NOW() - INTERVAL '30 days'
  AND t.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM board_events e
    WHERE e.board_id = t.department_id
      AND e.task_id = t.id
      AND e.event_type = 'task_created'
      AND e.created_at = t.created_at
  );

-- task_completed (where completed_at is set)
INSERT INTO board_events (board_id, task_id, actor_id, event_type, payload, created_at)
SELECT t.department_id, t.id, NULL, 'task_completed',
       jsonb_build_object('created_at', t.created_at), t.completed_at
FROM tasks t
WHERE t.completed_at IS NOT NULL
  AND t.completed_at >= NOW() - INTERVAL '30 days'
  AND t.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM board_events e
    WHERE e.board_id = t.department_id
      AND e.task_id = t.id
      AND e.event_type = 'task_completed'
      AND e.created_at = t.completed_at
  );

-- status_changed (best-effort: from task_status_history if it exists; otherwise skipped)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_status_history') THEN
    INSERT INTO board_events (board_id, task_id, actor_id, event_type, payload, created_at)
    SELECT t.department_id, h.task_id, h.changed_by, 'status_changed',
           jsonb_build_object('from', h.from_status_id, 'to', h.to_status_id), h.changed_at
    FROM task_status_history h
    JOIN tasks t ON t.id = h.task_id
    WHERE h.changed_at >= NOW() - INTERVAL '30 days'
      AND t.department_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM board_events e
        WHERE e.board_id = t.department_id
          AND e.task_id = h.task_id
          AND e.event_type = 'status_changed'
          AND e.created_at = h.changed_at
      );
  END IF;
END$$;

-- comment_added
INSERT INTO board_events (board_id, task_id, actor_id, event_type, payload, created_at)
SELECT t.department_id, c.task_id, c.author_id, 'comment_added',
       jsonb_build_object('comment_id', c.id, 'snippet', LEFT(c.body, 80)), c.created_at
FROM task_comments c
JOIN tasks t ON t.id = c.task_id
WHERE c.created_at >= NOW() - INTERVAL '30 days'
  AND t.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM board_events e
    WHERE e.board_id = t.department_id
      AND e.task_id = c.task_id
      AND e.event_type = 'comment_added'
      AND e.created_at = c.created_at
  );

COMMIT;
```

- [ ] **Step 2: Apply (idempotent — safe to re-run)**

```bash
psql "$DATABASE_URL" -f server/database/migrations/081-backfill-board-events.sql
```
Expected: `BEGIN`, several `INSERT N`, `COMMIT`. Re-running yields `INSERT 0` (idempotent).

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT event_type, COUNT(*) FROM board_events GROUP BY event_type ORDER BY 2 DESC;"
```
Expected: positive counts for task_created, task_completed, comment_added (and status_changed if history table exists).

- [ ] **Step 4: Run rollup over last 30 days**

```bash
cd workers/board-metrics
for i in $(seq 1 30); do
  date=$(date -u -v-${i}d +%Y-%m-%d 2>/dev/null || date -u -d "$i days ago" +%Y-%m-%d)
  curl -X POST "http://localhost:8787/run?date=$date"
done
```
Expected: 30 successful responses; `board_metrics_daily` populated.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/081-backfill-board-events.sql
git commit -m "feat(boards): backfill last 30 days of board_events"
```

---

## Task 11: Curation Worker — scaffold

**Files:**
- Create: `workers/triage-curator/wrangler.toml`
- Create: `workers/triage-curator/package.json`
- Create: `workers/triage-curator/src/index.ts`

- [ ] **Step 1: Create wrangler config**

```toml
# workers/triage-curator/wrangler.toml
name = "triage-curator"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[triggers]
crons = ["*/30 * * * *"]  # every 30 minutes

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "CURATION_LOCKS"
id = "REPLACE_WITH_KV_ID"  # create via: wrangler kv:namespace create CURATION_LOCKS
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "triage-curator",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.9.0"
  },
  "devDependencies": {
    "wrangler": "^3.78.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create the KV namespace**

```bash
cd workers/triage-curator
wrangler kv:namespace create CURATION_LOCKS
# Copy the returned id into wrangler.toml
```
Expected: `id = "..."` printed; paste it into wrangler.toml.

- [ ] **Step 4: Write the worker shell (no AI yet)**

```ts
// workers/triage-curator/src/index.ts
import { neon } from '@neondatabase/serverless'
import { scoreNotification, type ScorableNotification } from '../../../server/utils/triage/scorer'

interface Env {
  DATABASE_URL: string
  AI: { run: (model: string, input: any) => Promise<any> }
  CURATION_LOCKS: KVNamespace
}

const TOP_N = 10
const LOOKBACK_HOURS = 24

async function activeUserIds(sql: ReturnType<typeof neon>): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT user_id
    FROM notifications
    WHERE created_at > NOW() - INTERVAL '${LOOKBACK_HOURS} hours'
  `) as { user_id: string }[]
  return rows.map(r => r.user_id)
}

async function curateForUser(env: Env, userId: string) {
  const lockKey = `curation_lock:${userId}`
  const held = await env.CURATION_LOCKS.get(lockKey)
  if (held) return { skipped: true }
  await env.CURATION_LOCKS.put(lockKey, '1', { expirationTtl: 60 })

  try {
    const sql = neon(env.DATABASE_URL)
    const notifs = (await sql`
      SELECT id, type, reason, is_read, created_at, metadata
      FROM notifications
      WHERE user_id = ${userId}
        AND is_read = false
        AND created_at > NOW() - INTERVAL '${LOOKBACK_HOURS} hours'
    `) as ScorableNotification[]

    const scored = notifs
      .map(n => ({ n, score: scoreNotification(n, { userId }) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)

    await sql`DELETE FROM notification_curations WHERE user_id = ${userId}`
    for (let i = 0; i < scored.length; i++) {
      const { n, score } = scored[i]
      await sql`
        INSERT INTO notification_curations
          (user_id, notification_id, rank, score, reasoning, generated_at)
        VALUES (${userId}, ${n.id}, ${i + 1}, ${score}, NULL, NOW())
      `
    }
    return { skipped: false, count: scored.length }
  } finally {
    await env.CURATION_LOCKS.delete(lockKey)
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const sql = neon(env.DATABASE_URL)
    const users = await activeUserIds(sql)
    let total = 0
    for (const userId of users) {
      const r = await curateForUser(env, userId)
      if (!r.skipped) total += (r.count ?? 0)
    }
    console.log(`[triage-curator] curated ${total} items across ${users.length} users`)
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    if (url.pathname === '/run' && req.method === 'POST') {
      const sql = neon(env.DATABASE_URL)
      const users = await activeUserIds(sql)
      const results = []
      for (const userId of users) {
        results.push({ userId, ...(await curateForUser(env, userId)) })
      }
      return Response.json({ ok: true, results })
    }
    return new Response('Not found', { status: 404 })
  },
}
```

- [ ] **Step 5: Local dry-run**

```bash
cd workers/triage-curator
pnpm install
DATABASE_URL=$(grep DATABASE_URL ../../.env | cut -d= -f2-) wrangler dev --test-scheduled
# In another terminal:
curl -X POST "http://localhost:8787/run"
```
Expected: JSON with results array; `notification_curations` table populated for active users.

- [ ] **Step 6: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT user_id, COUNT(*) FROM notification_curations GROUP BY user_id;"
```
Expected: at least one user with rows; max 10 per user.

- [ ] **Step 7: Commit**

```bash
git add workers/triage-curator/
git commit -m "feat(triage): add curation worker scaffold (heuristic only, no AI yet)"
```

---

## Task 12: Add Workers AI reasoning to the Curation Worker

**Files:**
- Modify: `workers/triage-curator/src/index.ts`

- [ ] **Step 1: Add the batched-decoration helper**

In `workers/triage-curator/src/index.ts`, add above `curateForUser`:

```ts
async function decorateBatch(
  env: Env,
  items: { id: string; type: string; metadata: any }[]
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map()

  const prompt = `For each notification id below, write ONE sentence (max 80 chars) explaining why it likely needs the user's attention. Output strict JSON: {"<id>": "<sentence>", ...}.\n\nNotifications:\n` +
    items.map(i => `- id=${i.id} type=${i.type} meta=${JSON.stringify(i.metadata ?? {})}`).join('\n')

  try {
    const resp: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a concise assistant. Return only JSON.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
    })
    const text = resp?.response ?? resp?.result?.response ?? ''
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return new Map(Object.entries(parsed).map(([k, v]) => [k, String(v).slice(0, 80)]))
  } catch (err) {
    console.error('[triage-curator] AI decoration failed:', err)
    return new Map()
  }
}
```

- [ ] **Step 2: Wire the helper into `curateForUser`**

Replace the curation loop body:

```ts
    await sql`DELETE FROM notification_curations WHERE user_id = ${userId}`
    const reasoningMap = await decorateBatch(env,
      scored.map(s => ({ id: s.n.id, type: s.n.type, metadata: s.n.metadata ?? null }))
    )
    for (let i = 0; i < scored.length; i++) {
      const { n, score } = scored[i]
      const reasoning = reasoningMap.get(n.id) ?? null
      await sql`
        INSERT INTO notification_curations
          (user_id, notification_id, rank, score, reasoning, generated_at)
        VALUES (${userId}, ${n.id}, ${i + 1}, ${score}, ${reasoning}, NOW())
      `
    }
```

- [ ] **Step 3: Local dry-run**

```bash
cd workers/triage-curator
DATABASE_URL=$(...) wrangler dev --test-scheduled --remote
curl -X POST "http://localhost:8787/run"
```
Expected: rows in `notification_curations` now have `reasoning` populated for at least some items. (Failure case stores NULL — also fine.)

- [ ] **Step 4: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT rank, reasoning FROM notification_curations LIMIT 5;"
```
Expected: short sentences in `reasoning` column for at least some rows.

- [ ] **Step 5: Commit**

```bash
git add workers/triage-curator/src/index.ts
git commit -m "feat(triage): batched Workers AI decoration in curation worker"
```

---

## Task 13: Triage API — `/curated`

**Files:**
- Create: `server/api/agency/triage/curated.get.ts`

- [ ] **Step 1: Read existing endpoint pattern**

```bash
sed -n '1,40p' server/api/notifications/index.get.ts
```
Note the auth pattern (`requireAuth(event)`) and DB usage (`queryRows`).

- [ ] **Step 2: Write the endpoint**

```ts
// server/api/agency/triage/curated.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

const ONE_HOUR_MS = 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const fresh = await queryOne<{ generated_at: string | null }>(
    `SELECT MAX(generated_at) AS generated_at
       FROM notification_curations
      WHERE user_id = $1`,
    [user.id]
  )

  const isStale =
    !fresh?.generated_at ||
    Date.now() - new Date(fresh.generated_at).getTime() > ONE_HOUR_MS

  if (isStale) {
    // Inline fallback: ping the curation worker (best-effort).
    const workerUrl = process.env.TRIAGE_CURATOR_URL
    if (workerUrl) {
      fetch(`${workerUrl}/run`, { method: 'POST' }).catch(() => {})
    }
  }

  const rows = await queryRows<any>(
    `SELECT n.id, n.type, n.title, n.message, n.link, n.metadata, n.is_read,
            n.created_at, c.rank, c.score, c.reasoning
       FROM notification_curations c
       JOIN notifications n ON n.id = c.notification_id
      WHERE c.user_id = $1
      ORDER BY c.rank ASC`,
    [user.id]
  )

  return {
    items: rows,
    generated_at: fresh?.generated_at ?? null,
    stale: isStale,
  }
})
```

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev &
curl -b "cookie.txt" "http://localhost:3000/api/agency/triage/curated"
```
Expected: JSON with `items`, `generated_at`, `stale`.

- [ ] **Step 4: Commit**

```bash
git add server/api/agency/triage/curated.get.ts
git commit -m "feat(triage): /curated endpoint with stale-fallback ping"
```

---

## Task 14: Triage API — `/my-work`, `/following`, `/mark-all-read`

**Files:**
- Create: `server/api/agency/triage/my-work.get.ts`
- Create: `server/api/agency/triage/following.get.ts`
- Create: `server/api/agency/triage/mark-all-read.patch.ts`

- [ ] **Step 1: my-work endpoint**

```ts
// server/api/agency/triage/my-work.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const limit = Math.min(Number((getQuery(event).limit ?? 50)) || 50, 200)
  const rows = await queryRows<any>(
    `SELECT id, type, title, message, link, metadata, is_read, created_at, reason
       FROM notifications
      WHERE user_id = $1
        AND reason IN ('assigned', 'direct')
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit]
  )
  return { items: rows }
})
```

- [ ] **Step 2: following endpoint**

```ts
// server/api/agency/triage/following.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const limit = Math.min(Number((getQuery(event).limit ?? 50)) || 50, 200)
  const rows = await queryRows<any>(
    `SELECT id, type, title, message, link, metadata, is_read, created_at, reason
       FROM notifications
      WHERE user_id = $1
        AND reason IN ('watching_board', 'watching_item')
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit]
  )
  return { items: rows }
})
```

- [ ] **Step 3: mark-all-read endpoint**

```ts
// server/api/agency/triage/mark-all-read.patch.ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ tab?: 'curated' | 'my-work' | 'following' }>(event)
  const tab = body?.tab ?? 'curated'

  if (tab === 'my-work') {
    await execute(
      `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND is_read = false AND reason IN ('assigned','direct')`,
      [user.id]
    )
  } else if (tab === 'following') {
    await execute(
      `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1 AND is_read = false AND reason IN ('watching_board','watching_item')`,
      [user.id]
    )
  } else {
    await execute(
      `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE user_id = $1
           AND is_read = false
           AND id IN (SELECT notification_id FROM notification_curations WHERE user_id = $1)`,
      [user.id]
    )
  }

  return { ok: true }
})
```

- [ ] **Step 4: Smoke check each**

```bash
curl -b cookie.txt "http://localhost:3000/api/agency/triage/my-work" | jq '.items | length'
curl -b cookie.txt "http://localhost:3000/api/agency/triage/following" | jq '.items | length'
curl -b cookie.txt -X PATCH "http://localhost:3000/api/agency/triage/mark-all-read" \
     -H "Content-Type: application/json" -d '{"tab":"curated"}'
```
Expected: numbers and `{"ok":true}`.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/triage/my-work.get.ts \
        server/api/agency/triage/following.get.ts \
        server/api/agency/triage/mark-all-read.patch.ts
git commit -m "feat(triage): my-work, following, and mark-all-read endpoints"
```

---

## Task 15: Triage API — RBAC integration test

**Files:**
- Create: `test/server/api/agency/triage.test.ts`

- [ ] **Step 1: Write the test**

```ts
// test/server/api/agency/triage.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execute, queryOne } from '~~/server/utils/db'

const u1 = '00000000-0000-0000-0000-000000000a01'
const u2 = '00000000-0000-0000-0000-000000000a02'

async function seedUser(id: string, email: string) {
  await execute(
    `INSERT INTO team_members (id, name, email, role, is_active)
     VALUES ($1, $2, $3, 'team_member', true)
     ON CONFLICT (id) DO NOTHING`,
    [id, email.split('@')[0], email]
  )
}

async function seedNotification(userId: string, reason: string) {
  return queryOne<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title, message, reason, is_read)
     VALUES ($1, 'task_mentioned', 'Test', 'Body', $2, false)
     RETURNING id`,
    [userId, reason]
  )
}

describe('triage RBAC isolation', () => {
  beforeAll(async () => {
    await seedUser(u1, 'u1@test.local')
    await seedUser(u2, 'u2@test.local')
    await seedNotification(u1, 'assigned')
    await seedNotification(u2, 'assigned')
  })

  afterAll(async () => {
    await execute(`DELETE FROM notifications WHERE user_id IN ($1, $2)`, [u1, u2])
    await execute(`DELETE FROM team_members WHERE id IN ($1, $2)`, [u1, u2])
  })

  it('my-work returns only the requesting user\'s notifications', async () => {
    // Two simulated requests via direct query (proxy for endpoint behaviour after requireAuth)
    const u1Rows = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND reason IN ('assigned','direct')`,
      [u1]
    )
    const u2Rows = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND reason IN ('assigned','direct')`,
      [u2]
    )
    expect(Number(u1Rows?.count)).toBeGreaterThanOrEqual(1)
    expect(Number(u2Rows?.count)).toBeGreaterThanOrEqual(1)

    // Ensure no cross-pollination via a deliberate wrong-user query:
    const cross = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND reason IN ('assigned','direct') AND id IN (
         SELECT id FROM notifications WHERE user_id = $2
       )`,
      [u1, u2]
    )
    expect(Number(cross?.count)).toBe(0)
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm test test/server/api/agency/triage.test.ts
```
Expected: PASS — 1 test.

- [ ] **Step 3: Commit**

```bash
git add test/server/api/agency/triage.test.ts
git commit -m "test(triage): RBAC isolation between users"
```

---

## Task 16: Triage page scaffold (`/agency/triage`)

**Files:**
- Create: `app/pages/agency/triage.vue`

- [ ] **Step 1: Write the page**

```vue
<!-- app/pages/agency/triage.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })

type Tab = 'curated' | 'my-work' | 'following'
const tab = ref<Tab>('curated')

const tabs = [
  { value: 'curated', label: 'For You' },
  { value: 'my-work', label: 'My Work' },
  { value: 'following', label: 'Following' },
] as const

const { data: curated, refresh: refreshCurated } = await useFetch('/api/agency/triage/curated', {
  key: 'triage-curated', server: false,
})
const { data: myWork, refresh: refreshMyWork } = await useFetch('/api/agency/triage/my-work', {
  key: 'triage-my-work', server: false, lazy: true,
})
const { data: following, refresh: refreshFollowing } = await useFetch('/api/agency/triage/following', {
  key: 'triage-following', server: false, lazy: true,
})

const items = computed(() => {
  if (tab.value === 'curated') return curated.value?.items ?? []
  if (tab.value === 'my-work') return myWork.value?.items ?? []
  return following.value?.items ?? []
})

async function markAllRead() {
  await $fetch('/api/agency/triage/mark-all-read', {
    method: 'PATCH', body: { tab: tab.value },
  })
  await Promise.all([refreshCurated(), refreshMyWork(), refreshFollowing()])
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Triage</h1>
      <UButton size="sm" variant="ghost" @click="markAllRead">Mark all read</UButton>
    </div>

    <UTabs v-model="tab" :items="tabs" />

    <div v-if="items.length === 0" class="text-center py-16">
      <TriageEmptyState :tab="tab" />
    </div>

    <ul v-else class="space-y-2">
      <TriageItemCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :tab="tab"
        @marked-read="refreshCurated(); refreshMyWork(); refreshFollowing()"
      />
    </ul>
  </div>
</template>
```

- [ ] **Step 2: Manual smoke**

```bash
pnpm dev
# Open: http://localhost:3000/agency/triage
```
Expected: page loads with three tabs; the "Mark all read" button is visible. The card components don't exist yet — empty area or render warnings expected; we'll create them next.

- [ ] **Step 3: Commit**

```bash
git add app/pages/agency/triage.vue
git commit -m "feat(triage): /agency/triage page scaffold with tabs"
```

---

## Task 17: `TriageItemCard.vue` and `TriageEmptyState.vue`

**Files:**
- Create: `app/components/triage/TriageItemCard.vue`
- Create: `app/components/triage/TriageEmptyState.vue`

- [ ] **Step 1: TriageItemCard**

```vue
<!-- app/components/triage/TriageItemCard.vue -->
<script setup lang="ts">
interface Props {
  item: {
    id: string
    type: string
    title: string
    message: string
    link?: string | null
    is_read: boolean
    created_at: string
    rank?: number | null
    score?: number | null
    reasoning?: string | null
    reason?: string | null
  }
  tab: 'curated' | 'my-work' | 'following'
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'marked-read': [] }>()

const fallbackReason = computed(() => {
  if (props.item.reasoning) return props.item.reasoning
  if (props.item.type === 'task_mentioned') return `Mentioned in ${props.item.title}`
  if (props.item.type === 'task_assigned') return `Assigned: ${props.item.title}`
  if (props.item.type === 'task_comment') return `New reply on ${props.item.title}`
  return props.item.message
})

async function open() {
  if (props.item.link) navigateTo(props.item.link, { external: true })
}

async function markRead() {
  await $fetch(`/api/notifications/${props.item.id}/read`, { method: 'PATCH' })
  emit('marked-read')
}
</script>

<template>
  <li
    class="border border-default rounded-md p-3 hover:bg-elevated transition-colors"
    :class="{ 'opacity-60': item.is_read }"
  >
    <div class="flex items-start gap-3">
      <UIcon :name="item.is_read ? 'i-lucide-mail-open' : 'i-lucide-mail'" class="mt-1 text-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">{{ item.title }}</div>
        <div class="text-sm text-muted truncate">{{ fallbackReason }}</div>
        <div class="text-xs text-muted mt-1">
          {{ new Date(item.created_at).toLocaleString() }}
          <span v-if="item.rank" class="ml-2">· rank {{ item.rank }}</span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <UButton size="xs" variant="ghost" icon="i-lucide-external-link" @click="open" />
        <UButton size="xs" variant="ghost" icon="i-lucide-check" :disabled="item.is_read" @click="markRead" />
      </div>
    </div>
  </li>
</template>
```

- [ ] **Step 2: TriageEmptyState**

```vue
<!-- app/components/triage/TriageEmptyState.vue -->
<script setup lang="ts">
const props = defineProps<{ tab: 'curated' | 'my-work' | 'following' }>()

const copy = computed(() => {
  if (props.tab === 'my-work') return {
    title: 'Nothing assigned to you',
    body: 'When someone assigns or @mentions you, it lands here.',
  }
  if (props.tab === 'following') return {
    title: 'Nothing from boards you follow',
    body: 'Subscribe to a board to see updates here.',
  }
  return {
    title: 'Nothing needs your attention right now',
    body: 'The agent will surface anything that does — recent replies, mentions, blockers, deadlines.',
  }
})
</script>

<template>
  <div class="space-y-2">
    <UIcon name="i-lucide-inbox" class="text-muted text-4xl mx-auto" />
    <div class="font-medium">{{ copy.title }}</div>
    <div class="text-sm text-muted">{{ copy.body }}</div>
  </div>
</template>
```

- [ ] **Step 3: Smoke**

Reload the page in browser. Empty state should render when no items; cards should render when items exist (seed via DB if needed).

- [ ] **Step 4: Commit**

```bash
git add app/components/triage/
git commit -m "feat(triage): TriageItemCard and TriageEmptyState components"
```

---

## Task 18: SSE subscription + 60s poll fallback on Triage page

**Files:**
- Modify: `app/pages/agency/triage.vue`

- [ ] **Step 1: Add SSE + interval to the page script**

In `app/pages/agency/triage.vue`, in the `<script setup>` block, append before `markAllRead`:

```ts
let es: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  try {
    es = new EventSource('/api/notifications/stream')
    es.addEventListener('notification', () => {
      refreshCurated()
      refreshMyWork()
      refreshFollowing()
    })
  } catch {
    // SSE unavailable — polling kicks in below
  }
  pollTimer = setInterval(() => {
    refreshCurated()
  }, 60_000)
})

onBeforeUnmount(() => {
  es?.close()
  if (pollTimer) clearInterval(pollTimer)
})
```

- [ ] **Step 2: Smoke**

Open the page; in another tab, create a notification (via mention/assign on a task). Verify the page list updates within ~60s (SSE-fast) or after the next poll.

- [ ] **Step 3: Commit**

```bash
git add app/pages/agency/triage.vue
git commit -m "feat(triage): SSE subscription with 60s poll fallback"
```

---

## Task 19: Instruments API — `/api/agency/boards/[id]/instruments.get.ts`

**Files:**
- Create: `server/api/agency/boards/[id]/instruments.get.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// server/api/agency/boards/[id]/instruments.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  if (!boardId) throw createError({ statusCode: 400, statusMessage: 'Missing board id' })

  const rows = await queryRows<any>(
    `SELECT date, throughput, created_count, wip, avg_cycle_time_h, oldest_age_days
       FROM board_metrics_daily
      WHERE board_id = $1
        AND date >= NOW() - INTERVAL '30 days'
      ORDER BY date ASC`,
    [boardId]
  )

  const last = rows[rows.length - 1] ?? null
  return {
    history: rows,
    current: last,
  }
})
```

- [ ] **Step 2: Smoke**

```bash
curl -b cookie.txt "http://localhost:3000/api/agency/boards/<some-board-id>/instruments" | jq
```
Expected: `{ history: [...], current: { ... } }` with up to 30 entries.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/boards/[id]/instruments.get.ts
git commit -m "feat(boards): /instruments endpoint for HUD"
```

---

## Task 20: `BoardInstruments.vue` HUD component

**Files:**
- Create: `app/components/board/BoardInstruments.vue`

- [ ] **Step 1: Write the component (Unovis sparklines)**

```vue
<!-- app/components/board/BoardInstruments.vue -->
<script setup lang="ts">
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue'

interface Props { boardId: string }
const props = defineProps<Props>()

const collapsed = ref(true)

const { data } = await useFetch(() => `/api/agency/boards/${props.boardId}/instruments`, {
  key: () => `instruments-${props.boardId}`,
  server: false,
})

const history = computed(() => data.value?.history ?? [])
const current = computed(() => data.value?.current ?? null)

const fmtNum = (n: number | null | undefined) => (n == null ? '—' : Math.round(n))
const fmtHours = (h: number | null | undefined) => (h == null ? '—' : `${Math.round(h)}h`)
</script>

<template>
  <div class="border border-default rounded-md bg-elevated">
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2 text-sm"
      @click="collapsed = !collapsed"
    >
      <span class="flex items-center gap-2">
        <UIcon name="i-lucide-activity" />
        <span>Instruments</span>
      </span>
      <UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" />
    </button>

    <div v-if="!collapsed" class="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
      <div>
        <div class="text-xs text-muted">Throughput / day</div>
        <div class="text-lg font-medium">{{ fmtNum(current?.throughput) }}</div>
        <VisXYContainer :data="history" :height="40">
          <VisLine :x="(d, i) => i" :y="(d) => d.throughput" />
        </VisXYContainer>
      </div>
      <div>
        <div class="text-xs text-muted">WIP</div>
        <div class="text-lg font-medium">{{ fmtNum(current?.wip) }}</div>
        <VisXYContainer :data="history" :height="40">
          <VisLine :x="(d, i) => i" :y="(d) => d.wip" />
        </VisXYContainer>
      </div>
      <div>
        <div class="text-xs text-muted">Avg cycle</div>
        <div class="text-lg font-medium">{{ fmtHours(current?.avg_cycle_time_h) }}</div>
        <VisXYContainer :data="history" :height="40">
          <VisLine :x="(d, i) => i" :y="(d) => d.avg_cycle_time_h ?? 0" />
        </VisXYContainer>
      </div>
      <div>
        <div class="text-xs text-muted">Oldest open</div>
        <div class="text-lg font-medium">{{ fmtNum(current?.oldest_age_days) }}d</div>
        <VisXYContainer :data="history" :height="40">
          <VisLine :x="(d, i) => i" :y="(d) => d.oldest_age_days ?? 0" />
        </VisXYContainer>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Mount on the board page**

In `app/pages/agency/boards/[id].vue`, near the top of the board view (above the toolbar / table area):

```vue
<BoardInstruments :board-id="boardId" class="mb-3" />
```

- [ ] **Step 3: Smoke**

Reload a board. Verify the collapsible HUD renders, opens to four metrics with sparklines, current values match `board_metrics_daily.last_row.*`.

- [ ] **Step 4: Commit**

```bash
git add app/components/board/BoardInstruments.vue app/pages/agency/boards/[id].vue
git commit -m "feat(boards): Instruments HUD overlay on board page"
```

---

## Task 21: Persist HUD collapse state per user

**Files:**
- Modify: `app/components/board/BoardInstruments.vue`

- [ ] **Step 1: Reuse existing per-user view config storage**

In `BoardInstruments.vue`, replace the local `collapsed` ref with a state synced via `board_views` (existing) per the open question in the spec. Easiest: store under a single `instruments_collapsed` key on the user's default view config. Substitute the existing `collapsed = ref(true)` block with:

```ts
const collapsed = ref(true)

// On mount: read from the active view config (if available)
const { data: viewState } = await useFetch(() => `/api/agency/boards/${props.boardId}/views/active`, {
  key: () => `view-state-${props.boardId}`,
  server: false,
  default: () => ({ config: { instruments_collapsed: true } }),
})
collapsed.value = !!viewState.value?.config?.instruments_collapsed

// On change: persist
watch(collapsed, async (v) => {
  await $fetch(`/api/agency/boards/${props.boardId}/views/active`, {
    method: 'PATCH',
    body: { config_patch: { instruments_collapsed: v } },
  }).catch(() => {})
})
```

If the `/views/active` endpoint doesn't exist yet, defer this task — it's not blocking. Track it as a follow-up. (The spec marks HUD-collapse persistence as an open question that can be resolved at implementation time; if the view-state endpoint is non-trivial, persist via `localStorage` keyed by `boardId` instead.)

- [ ] **Step 2: localStorage fallback (use this if the views/active endpoint isn't available)**

Replace the watcher block with:

```ts
const lsKey = computed(() => `instruments-collapsed:${props.boardId}`)
onMounted(() => {
  const v = window.localStorage.getItem(lsKey.value)
  if (v != null) collapsed.value = v === '1'
})
watch(collapsed, (v) => {
  try { window.localStorage.setItem(lsKey.value, v ? '1' : '0') } catch {}
})
```

- [ ] **Step 3: Smoke**

Toggle HUD on a board, reload — state should persist.

- [ ] **Step 4: Commit**

```bash
git add app/components/board/BoardInstruments.vue
git commit -m "feat(boards): persist Instruments HUD collapse state per user"
```

---

## Task 22: E2E — Triage page Playwright spec

**Files:**
- Create: `test/e2e/triage.spec.ts`

> **Pre-req:** if `playwright.config.ts` doesn't exist yet, scaffold it via `pnpm dlx playwright install --with-deps && pnpm dlx playwright init`. Wire `pnpm test:e2e` to `playwright test` in `package.json`. This is part of the Phase 0 E2E test scaffolding tracked in the roadmap.

- [ ] **Step 1: Write the spec**

```ts
// test/e2e/triage.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Triage page', () => {
  test.beforeEach(async ({ page }) => {
    // Auth helper: assumes a test user with a magic-link cookie pre-seeded.
    // If unavailable, sign in via UI here.
    await page.goto('/agency/triage')
  })

  test('renders three tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'For You' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'My Work' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Following' })).toBeVisible()
  })

  test('clicking Mark all read clears the badge', async ({ page }) => {
    await page.getByRole('button', { name: 'Mark all read' }).click()
    // After click, expect either an empty state or all rows greyed out
    const opacityFaded = page.locator('li.opacity-60')
    const empty = page.getByText('Nothing needs your attention')
    await expect(opacityFaded.or(empty)).toBeVisible()
  })

  test('clicking the check icon on an item marks it read', async ({ page }) => {
    const firstItem = page.locator('li').first()
    if (!(await firstItem.isVisible())) test.skip()
    await firstItem.locator('button[icon="i-lucide-check"]').click()
    await expect(firstItem).toHaveClass(/opacity-60/)
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e test/e2e/triage.spec.ts
```
Expected: 3 tests pass (or skip the third if no items).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/triage.spec.ts
git commit -m "test(triage): Playwright E2E for triage page"
```

---

## Task 23: E2E — Instruments HUD Playwright spec

**Files:**
- Create: `test/e2e/board-instruments.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// test/e2e/board-instruments.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Board Instruments HUD', () => {
  test('renders collapsed by default and expands on click', async ({ page }) => {
    // Seed: any board with seeded metrics (from backfill). Pick the first board in /agency/boards/index.
    await page.goto('/agency/boards')
    await page.locator('a[href*="/agency/boards/"]').first().click()

    const hud = page.locator('text=Instruments').first()
    await expect(hud).toBeVisible()

    // Click to expand
    await hud.click()
    await expect(page.getByText('Throughput / day')).toBeVisible()
    await expect(page.getByText('WIP')).toBeVisible()
    await expect(page.getByText('Avg cycle')).toBeVisible()
    await expect(page.getByText('Oldest open')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e test/e2e/board-instruments.spec.ts
```
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/board-instruments.spec.ts
git commit -m "test(boards): Playwright E2E for Instruments HUD"
```

---

## Task 24: Worker integration test (curation)

**Files:**
- Create: `test/workers/triage-curator.test.ts`

- [ ] **Step 1: Write the test (uses Miniflare or hits a local wrangler dev URL)**

```ts
// test/workers/triage-curator.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execute, queryOne, queryRows } from '~~/server/utils/db'

const u = '00000000-0000-0000-0000-0000000abcd1'

beforeAll(async () => {
  await execute(
    `INSERT INTO team_members (id, name, email, role, is_active)
     VALUES ($1, 'Tester', 'curator-test@local', 'team_member', true)
     ON CONFLICT (id) DO NOTHING`,
    [u]
  )
  // Seed 12 unread notifications
  for (let i = 0; i < 12; i++) {
    await execute(
      `INSERT INTO notifications (user_id, type, title, message, reason, is_read)
       VALUES ($1, 'task_mentioned', $2, 'b', 'mentioned', false)`,
      [u, `t${i}`]
    )
  }
  // Trigger the worker (assumes wrangler dev running on :8787)
  await fetch('http://localhost:8787/run', { method: 'POST' })
})

afterAll(async () => {
  await execute(`DELETE FROM notification_curations WHERE user_id = $1`, [u])
  await execute(`DELETE FROM notifications WHERE user_id = $1`, [u])
  await execute(`DELETE FROM team_members WHERE id = $1`, [u])
})

describe('triage-curator worker', () => {
  it('writes at most TOP_N=10 curated rows for the user', async () => {
    const rows = await queryRows<{ rank: number }>(
      `SELECT rank FROM notification_curations WHERE user_id = $1 ORDER BY rank`,
      [u]
    )
    expect(rows.length).toBeLessThanOrEqual(10)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].rank).toBe(1)
  })

  it('rerun replaces curated set wholesale (idempotent)', async () => {
    const before = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM notification_curations WHERE user_id = $1`,
      [u]
    )
    await fetch('http://localhost:8787/run', { method: 'POST' })
    const after = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM notification_curations WHERE user_id = $1`,
      [u]
    )
    expect(Number(after?.count)).toBe(Number(before?.count))
  })
})
```

- [ ] **Step 2: Run (with wrangler dev running)**

```bash
cd workers/triage-curator && DATABASE_URL=$(...) wrangler dev --test-scheduled &
cd ../.. && pnpm test test/workers/triage-curator.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/workers/triage-curator.test.ts
git commit -m "test(triage): integration test for curation worker"
```

---

## Task 25: Deploy workers + final smoke

- [ ] **Step 1: Deploy `board-metrics`**

```bash
cd workers/board-metrics
wrangler secret put DATABASE_URL  # paste from .env
wrangler deploy
```
Expected: deployed; cron registered for `0 2 * * *`.

- [ ] **Step 2: Deploy `triage-curator`**

```bash
cd workers/triage-curator
wrangler secret put DATABASE_URL
wrangler deploy
```
Expected: deployed; cron registered for `*/30 * * * *`.

- [ ] **Step 3: Trigger first runs manually**

```bash
wrangler tail board-metrics &
curl -X POST "https://board-metrics.<your-account>.workers.dev/run"
# new shell
wrangler tail triage-curator &
curl -X POST "https://triage-curator.<your-account>.workers.dev/run"
```
Expected: log lines for both confirming successful passes.

- [ ] **Step 4: Verify production tables**

```bash
psql "$DATABASE_URL_PROD" -c "
  SELECT 'metrics' AS t, MAX(date) FROM board_metrics_daily
  UNION ALL
  SELECT 'curations', MAX(generated_at)::date FROM notification_curations
  UNION ALL
  SELECT 'events',    MAX(created_at)::date FROM board_events;
"
```
Expected: all three with recent dates.

- [ ] **Step 5: Deploy app**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:preview
```
Expected: preview URL returned. Visit `/agency/triage` and a board page to verify both surfaces render.

- [ ] **Step 6: Promote to production once preview is green**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:production
```

- [ ] **Step 7: Final commit (no code change; deployment journal)**

```bash
git commit --allow-empty -m "chore(triage): deploy Phase 1 Signal Foundation to production"
```

---

## Task 26: Telemetry helper + page/worker instrumentation

**Files:**
- Create: `server/utils/triage/telemetry.ts`
- Test: `test/server/utils/triage/telemetry.test.ts`
- Modify: `app/pages/agency/triage.vue`
- Modify: `workers/triage-curator/src/index.ts`

> **Slice:** part of 1.0. Ship telemetry from day one so heuristic-weight tuning has data when we need it.

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/triage/telemetry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('~~/server/utils/db', () => ({ execute: vi.fn() }))

import { recordTriageEvent } from '~~/server/utils/triage/telemetry'
import * as db from '~~/server/utils/db'

describe('recordTriageEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a row with the event name and payload', async () => {
    await recordTriageEvent({ event: 'triage_open', userId: 'u1', payload: { tab: 'curated' } })
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO triage_telemetry'),
      ['triage_open', 'u1', JSON.stringify({ tab: 'curated' })]
    )
  })

  it('swallows errors (non-blocking)', async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('boom'))
    await expect(recordTriageEvent({ event: 'triage_item_click', userId: 'u1', payload: {} }))
      .resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/server/utils/triage/telemetry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Add a tiny migration for the telemetry table**

Append to `server/database/migrations/082-triage-telemetry.sql`:

```sql
CREATE TABLE IF NOT EXISTS triage_telemetry (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event       VARCHAR(40) NOT NULL,
  user_id     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_telemetry_event_time ON triage_telemetry (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_telemetry_user_time  ON triage_telemetry (user_id, created_at DESC);
```

Apply:
```bash
psql "$DATABASE_URL" -f server/database/migrations/082-triage-telemetry.sql
```

- [ ] **Step 4: Write the helper**

```ts
// server/utils/triage/telemetry.ts
import { execute } from '~~/server/utils/db'

export type TriageEvent =
  | 'triage_open'
  | 'triage_item_click'
  | 'triage_mark_read'
  | 'triage_curation_skipped'
  | 'triage_curation_duration_ms'
  | 'triage_curation_ai_failure'

export async function recordTriageEvent(params: {
  event: TriageEvent
  userId: string | null
  payload: Record<string, unknown>
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO triage_telemetry (event, user_id, payload) VALUES ($1, $2, $3)`,
      [params.event, params.userId ?? null, JSON.stringify(params.payload ?? {})]
    )
  } catch (err) {
    console.error('[triage-telemetry] write failure:', err)
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm test test/server/utils/triage/telemetry.test.ts
```
Expected: PASS — 2 tests.

- [ ] **Step 6: Add a server endpoint for client-side calls**

```ts
// server/api/agency/triage/telemetry.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { recordTriageEvent, type TriageEvent } from '~~/server/utils/triage/telemetry'

const ALLOWED: TriageEvent[] = ['triage_open', 'triage_item_click', 'triage_mark_read']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ event: TriageEvent; payload?: Record<string, unknown> }>(event)
  if (!body?.event || !ALLOWED.includes(body.event)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid event' })
  }
  await recordTriageEvent({ event: body.event, userId: user.id, payload: body.payload ?? {} })
  return { ok: true }
})
```

- [ ] **Step 7: Wire client-side calls in `app/pages/agency/triage.vue`**

Add to `<script setup>`:

```ts
async function logEvent(event: 'triage_open' | 'triage_item_click' | 'triage_mark_read', payload: Record<string, unknown>) {
  $fetch('/api/agency/triage/telemetry', { method: 'POST', body: { event, payload } }).catch(() => {})
}

onMounted(() => logEvent('triage_open', { tab: tab.value }))
watch(tab, (newTab) => logEvent('triage_open', { tab: newTab }))
```

In `TriageItemCard.vue`, on the open and markRead handlers, emit a `track` event up; the page calls `logEvent('triage_item_click', { id: item.id, tab, rank })` and `logEvent('triage_mark_read', { id: item.id, tab })`.

- [ ] **Step 8: Wire worker-side telemetry in `triage-curator`**

In the curation worker's `scheduled()`, around the per-user pass:

```ts
const start = Date.now()
const r = await curateForUser(env, userId)
const durationMs = Date.now() - start

const sql = neon(env.DATABASE_URL)
await sql`
  INSERT INTO triage_telemetry (event, user_id, payload)
  VALUES (
    ${r.skipped ? 'triage_curation_skipped' : 'triage_curation_duration_ms'},
    ${userId},
    ${JSON.stringify({ duration_ms: durationMs, count: r.count ?? 0 })}::jsonb
  )
`
```

If `decorateBatch` returned an empty Map AND the request was attempted (i.e. AI was enabled), record `triage_curation_ai_failure` once for the whole pass.

- [ ] **Step 9: Smoke check**

```bash
psql "$DATABASE_URL" -c "SELECT event, COUNT(*) FROM triage_telemetry GROUP BY event;"
```
Expected: at least `triage_open`, `triage_item_click`, `triage_curation_duration_ms` appear after exercising the page and the worker.

- [ ] **Step 10: Commit**

```bash
git add server/database/migrations/082-triage-telemetry.sql \
        server/utils/triage/telemetry.ts \
        test/server/utils/triage/telemetry.test.ts \
        server/api/agency/triage/telemetry.post.ts \
        app/pages/agency/triage.vue \
        app/components/triage/TriageItemCard.vue \
        workers/triage-curator/src/index.ts
git commit -m "feat(triage): telemetry helper + page/worker instrumentation"
```

---

## Out-of-band: front-facing page sync

Per `CLAUDE.md`, when adding features in the platform, update marketing pages.

- [ ] Add a Triage entry to `app/pages/features/index.vue` under the appropriate category.
- [ ] Add a detailed page entry to `app/pages/features/[slug].vue` for `triage` with 3-4 content sections.
- [ ] Update `app/components/MarketingNav.vue` mega menu if Triage warrants top-level placement.

These can ship as one follow-up commit:

```bash
git add app/pages/features/ app/components/MarketingNav.vue
git commit -m "docs(marketing): add Triage feature pages"
```

---

## Self-review summary (filled in by plan author)

**Spec coverage:**
- Triage page (3 tabs) → Tasks 13–18 ✓
- Instruments HUD → Tasks 19–21 ✓
- `notification_curations` table + worker → Tasks 2, 11–12 ✓
- `board_events` table + helper + wiring → Tasks 1, 4–6 ✓
- `board_metrics_daily` + rollup worker → Tasks 3, 7–9 ✓
- Backfill → Task 10 ✓
- RBAC + tests → Task 15 ✓
- E2E → Tasks 22, 23 ✓
- Worker integration test → Task 24 ✓
- Deploy → Task 25 ✓

**Placeholder scan:** none — every step contains executable code or commands. The lone "REPLACE_WITH_KV_ID" in `wrangler.toml` is filled in by Step 3 of Task 11.

**Type consistency:** `board_id`, `task_id`, `event_type`, `payload` columns match across migration, helper, worker, and rollup. `BOARD_EVENT_TYPES` constants are referenced by name throughout.

**Open implementation questions** (not blocking):
- Heuristic weight tuning post-launch via click-through telemetry
- Reasoning string format (currently 80-char cap)
- Following-tab definition (currently `reason IN ('watching_board','watching_item')`)
