# Phase A — Board Watch Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface notification reasons in the inbox, expose granular event/email subscription controls, and show watcher count + avatars on each board's Watch popover — without expanding subscription scope (item/column/snooze come in Phase B).

**Architecture:** Single `notifications.reason` column carries one of `mentioned | assigned | watching_board | watching_item | direct`. The board dispatcher (`notifyBoardSubscribers`) infers `watching_board` vs `watching_item` from the matched subscription's `item_id`; mention/assignee dispatchers set their reason directly. Frontend renders a `UBadge` next to the notification title. Watch popover gains a "Custom…" radio that opens a `UModal` with 5 grouped event checkboxes + email toggle, posting to the existing `/subscribe` endpoint. Avatar stack pulls from `subscribers.get.ts` with a new `?summary=true` query mode.

**Tech Stack:** Nuxt 4 / Vue 3 Composition API, Nuxt UI v4, Neon Postgres, Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-04-28-phase-a-watch-improvements-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `server/database/migrations/077-notifications-reason.sql` | create | Add `reason` column + filtered index |
| `server/utils/notifications.ts` | modify | Accept `reason` in `CreateNotificationParams`; persist in INSERT; thread through `notifyMention` and `notifyTaskAssigned` |
| `server/utils/subscriptions.ts` | modify | `getSubscribers()` returns `itemId` per matched row |
| `server/utils/boardNotifications.ts` | modify | Compute reason from matched scope, pass to `createNotification` |
| `server/api/notifications/index.get.ts` | modify | Select and return `reason` in list response |
| `server/api/agency/boards/[id]/subscribers.get.ts` | modify | Add `?summary=true` mode returning `{count, top: [..3]}` |
| `app/composables/useNotifications.ts` | modify | Add `reason` to `Notification` interface |
| `app/components/NotificationsSlideover.vue` | modify | Render reason `UBadge` next to title |
| `app/components/board/BoardWatchSubscriberStack.vue` | create | Avatar stack + count, slotted in Watch popover header |
| `app/components/board/BoardWatchSettings.vue` | create | "Custom…" modal: 5 grouped checkboxes + email toggle + Save/Cancel |
| `app/components/board/BoardHeader.vue` | modify | Add "Custom…" option, mount stack and modal |
| `test/server/utils/notifications.test.ts` | modify | Cover `reason` propagation through createNotification, notifyMention, notifyTaskAssigned |
| `test/server/utils/boardNotifications.test.ts` | modify | Cover reason inference (item_id → watching_item, NULL → watching_board) |
| `test/server/utils/subscriptions.test.ts` | create or extend | Cover `getSubscribers` returning `itemId` |

---

## Task 1: Migration — add `notifications.reason`

**Files:**
- Create: `server/database/migrations/077-notifications-reason.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 077-notifications-reason.sql
-- Adds reason column to notifications, surfacing WHY each notification was sent.
-- Phase A of Watch improvements (see docs/superpowers/specs/2026-04-28-phase-a-watch-improvements-design.md).
--
-- Values: 'mentioned' | 'assigned' | 'watching_board' | 'watching_item' | 'direct'
-- Existing rows stay NULL and render without a badge.
-- Filtered index supports the upcoming Phase B "filter by reason" inbox facet.

BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_reason
  ON notifications(user_id, reason)
  WHERE reason IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Run the migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/077-notifications-reason.sql
```
Expected: `BEGIN`, `ALTER TABLE`, `CREATE INDEX`, `COMMIT` — no errors.

- [ ] **Step 3: Verify the column landed**

```bash
psql "$DATABASE_URL" -c "\d notifications" | grep reason
```
Expected: a line like `reason | text | …`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/077-notifications-reason.sql
git commit -m "feat(notifications): add reason column for inbox legibility"
```

---

## Task 2: `createNotification` accepts and stores `reason`

**Files:**
- Modify: `server/utils/notifications.ts:33-42, 119-168`
- Test: `test/server/utils/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/server/utils/notifications.test.ts` (create the file if it does not exist, mirroring the mocking pattern in `test/server/utils/boardNotifications.test.ts`):

```ts
describe('createNotification reason', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists reason in the INSERT statement when provided', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ notification_preferences: {} }) // pref check
      .mockResolvedValueOnce({ id: 'n1', created_at: new Date().toISOString() }) // insert

    await createNotification({
      userId: 'u1',
      type: 'task_assigned',
      title: 't',
      message: 'm',
      reason: 'assigned',
    })

    // The second queryOne call is the INSERT — its second arg is the params array.
    const insertCall = mockQueryOne.mock.calls[1]
    const sql = insertCall[0] as string
    const params = insertCall[1] as any[]
    expect(sql).toMatch(/INSERT INTO notifications/)
    expect(sql).toMatch(/reason/)
    expect(params).toContain('assigned')
  })

  it('omits reason gracefully when not provided', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ notification_preferences: {} })
      .mockResolvedValueOnce({ id: 'n2', created_at: new Date().toISOString() })

    await createNotification({
      userId: 'u1',
      type: 'system',
      title: 't',
      message: 'm',
    })

    const insertCall = mockQueryOne.mock.calls[1]
    const params = insertCall[1] as any[]
    // reason should be the last positional param and explicitly null
    expect(params[params.length - 1]).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/server/utils/notifications.test.ts
```
Expected: FAIL — either "reason" not in SQL, or function rejects unknown property.

- [ ] **Step 3: Add `reason` to `CreateNotificationParams`**

In `server/utils/notifications.ts:33-42`, replace the interface:

```ts
interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
  actorId?: string
  metadata?: Record<string, any>
  sendEmail?: boolean
  reason?: 'mentioned' | 'assigned' | 'watching_board' | 'watching_item' | 'direct'
}
```

- [ ] **Step 4: Update the INSERT to include `reason`**

In `server/utils/notifications.ts:149-161`, replace the INSERT:

```ts
const notification = await queryOne(`
  INSERT INTO notifications (user_id, type, title, message, link, actor_id, metadata, reason)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id, created_at
`, [
  params.userId,
  params.type,
  params.title,
  params.message,
  params.link || null,
  params.actorId || null,
  params.metadata ? JSON.stringify(params.metadata) : null,
  params.reason || null
])
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run test/server/utils/notifications.test.ts
```
Expected: PASS for both new cases.

- [ ] **Step 6: Commit**

```bash
git add server/utils/notifications.ts test/server/utils/notifications.test.ts
git commit -m "feat(notifications): accept and store reason on createNotification"
```

---

## Task 3: `notifyMention` sets reason='mentioned'

**Files:**
- Modify: `server/utils/notifications.ts:340-352`
- Test: `test/server/utils/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/server/utils/notifications.test.ts`:

```ts
import { notifyMention } from '../../../server/utils/notifications'

describe('notifyMention', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes reason="mentioned" to createNotification', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com' })   // mentioner
      .mockResolvedValueOnce({ name: 'Bob', email: 'b@x.com', notification_preferences: { email_task_mentioned: false } }) // mentioned
      .mockResolvedValueOnce({ notification_preferences: {} })       // pref check inside createNotification
      .mockResolvedValueOnce({ id: 'n', created_at: new Date().toISOString() }) // INSERT

    await notifyMention({
      taskId: 't1',
      taskTitle: 'Task',
      mentionedUserId: 'bob',
      mentionerId: 'alice',
      commentSnippet: 'hi @Bob',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    expect(insertCall).toBeDefined()
    const params = insertCall![1] as any[]
    expect(params[params.length - 1]).toBe('mentioned')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/server/utils/notifications.test.ts -t notifyMention
```
Expected: FAIL — the last param is `null`.

- [ ] **Step 3: Add `reason: 'mentioned'` to the createNotification call**

In `server/utils/notifications.ts`, locate the `notifyMention` function and update the `createNotification` call (around line 340):

```ts
await createNotification({
  userId: params.mentionedUserId,
  type: 'task_mentioned',
  title: 'You were mentioned',
  message: `${mentioner.name} mentioned you in "${params.taskTitle}"`,
  link: `/agency/tasks/${params.taskId}`,
  actorId: params.mentionerId,
  reason: 'mentioned',
  metadata: {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    commentSnippet: params.commentSnippet.substring(0, 100)
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/server/utils/notifications.test.ts -t notifyMention
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/notifications.ts test/server/utils/notifications.test.ts
git commit -m "feat(notifications): tag mention notifications with reason=mentioned"
```

---

## Task 4: `notifyTaskAssigned` sets reason='assigned'

**Files:**
- Modify: `server/utils/notifications.ts:208-220`
- Test: `test/server/utils/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/server/utils/notifications.test.ts`:

```ts
import { notifyTaskAssigned } from '../../../server/utils/notifications'

describe('notifyTaskAssigned', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes reason="assigned" to createNotification', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com' })   // assigner
      .mockResolvedValueOnce({ name: 'Bob', email: 'b@x.com', notification_preferences: { email_task_assigned: false } }) // assignee
      .mockResolvedValueOnce({ notification_preferences: {} })       // pref check inside createNotification
      .mockResolvedValueOnce({ id: 'n', created_at: new Date().toISOString() })

    await notifyTaskAssigned({
      taskId: 't1',
      taskTitle: 'Task',
      assigneeId: 'bob',
      assignerId: 'alice',
    })

    const insertCall = mockQueryOne.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO notifications')
    )
    expect(insertCall).toBeDefined()
    const params = insertCall![1] as any[]
    expect(params[params.length - 1]).toBe('assigned')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/server/utils/notifications.test.ts -t notifyTaskAssigned
```
Expected: FAIL.

- [ ] **Step 3: Add `reason: 'assigned'` to the createNotification call**

In `server/utils/notifications.ts:208-220`:

```ts
await createNotification({
  userId: params.assigneeId,
  type: 'task_assigned',
  title: 'New Task Assigned',
  message: `${assigner.name} assigned you to "${params.taskTitle}"`,
  link: `/agency/tasks/${params.taskId}`,
  actorId: params.assignerId,
  reason: 'assigned',
  metadata: {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    projectName: params.projectName
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/server/utils/notifications.test.ts -t notifyTaskAssigned
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/notifications.ts test/server/utils/notifications.test.ts
git commit -m "feat(notifications): tag assignment notifications with reason=assigned"
```

---

## Task 5: `getSubscribers` returns `itemId` per row

**Files:**
- Modify: `server/utils/subscriptions.ts:23-69`
- Test: `test/server/utils/subscriptions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/subscriptions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: any[]) => mockQueryRows(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}))

import { getSubscribers } from '../../../server/utils/subscriptions'

describe('getSubscribers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns itemId per matched row (NULL for board-level subs)', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { user_id: 'u1', notify_inapp: true, notify_email: false, item_id: null },
      { user_id: 'u2', notify_inapp: true, notify_email: false, item_id: 'item-1' },
    ])

    const result = await getSubscribers({
      boardId: 'b1',
      itemId: 'item-1',
      eventType: 'cell_updated',
    })

    expect(result).toEqual([
      { userId: 'u1', notifyInapp: true, notifyEmail: false, itemId: null },
      { userId: 'u2', notifyInapp: true, notifyEmail: false, itemId: 'item-1' },
    ])
  })

  it('selects bs.item_id in the SQL', async () => {
    mockQueryRows.mockResolvedValueOnce([])

    await getSubscribers({ boardId: 'b1', eventType: 'task_updated' })

    const sql = mockQueryRows.mock.calls[0][0] as string
    expect(sql).toMatch(/bs\.item_id/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/server/utils/subscriptions.test.ts
```
Expected: FAIL — `itemId` missing from return shape and SQL doesn't select `bs.item_id`.

- [ ] **Step 3: Update `getSubscribers` SQL and return shape**

In `server/utils/subscriptions.ts:23-69`, update both the SELECT and the return mapping:

```ts
export async function getSubscribers(params: {
  boardId: string
  itemId?: string
  columnId?: string
  eventType: string
}): Promise<Array<{ userId: string; notifyInapp: boolean; notifyEmail: boolean; itemId: string | null }>> {
  const { boardId, itemId, columnId, eventType } = params

  const conditions: string[] = ['bs.board_id = $1', 'bs.is_muted = false']
  const values: any[] = [boardId]
  let idx = 2

  const scopeParts: string[] = ['bs.item_id IS NULL AND bs.column_id IS NULL']
  if (itemId) {
    scopeParts.push(`bs.item_id = $${idx}`)
    values.push(itemId)
    idx++
  }
  if (columnId) {
    scopeParts.push(`bs.column_id = $${idx}`)
    values.push(columnId)
    idx++
  }
  conditions.push(`(${scopeParts.join(' OR ')})`)

  conditions.push(`(bs.events = '{}' OR bs.events @> ARRAY[$${idx}]::text[])`)
  values.push(eventType)

  const rows = await queryRows(`
    SELECT DISTINCT ON (bs.user_id)
      bs.user_id,
      bs.notify_inapp,
      bs.notify_email,
      bs.item_id
    FROM board_subscriptions bs
    WHERE ${conditions.join(' AND ')}
    ORDER BY bs.user_id, bs.item_id NULLS LAST
  `, values)

  return rows.map(r => ({
    userId: r.user_id,
    notifyInapp: r.notify_inapp,
    notifyEmail: r.notify_email,
    itemId: r.item_id,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/server/utils/subscriptions.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/subscriptions.ts test/server/utils/subscriptions.test.ts
git commit -m "feat(subscriptions): return itemId per matched row in getSubscribers"
```

---

## Task 6: `notifyBoardSubscribers` infers reason from scope

**Files:**
- Modify: `server/utils/boardNotifications.ts:29-114`
- Test: `test/server/utils/boardNotifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/server/utils/boardNotifications.test.ts`:

```ts
import { notifyBoardSubscribers } from '../../../server/utils/boardNotifications'

const mockGetSubscribers = vi.fn()
vi.mock('~~/server/utils/subscriptions', () => ({
  getSubscribers: (...args: any[]) => mockGetSubscribers(...args),
}))

const mockCreateNotification = vi.fn()
vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}))

describe('notifyBoardSubscribers reason inference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({ name: 'Alice', title: 'Item Title' })
    mockCreateNotification.mockResolvedValue(undefined)
  })

  it('tags board-level subscribers (item_id NULL) with reason=watching_board', async () => {
    mockGetSubscribers.mockResolvedValueOnce([
      { userId: 'u1', notifyInapp: true, notifyEmail: false, itemId: null },
    ])

    await notifyBoardSubscribers({
      boardId: 'b1',
      type: 'cell_updated',
      taskId: 't1',
      actorId: 'actor',
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', reason: 'watching_board' })
    )
  })

  it('tags item-level subscribers (item_id set) with reason=watching_item', async () => {
    mockGetSubscribers.mockResolvedValueOnce([
      { userId: 'u2', notifyInapp: true, notifyEmail: false, itemId: 't1' },
    ])

    await notifyBoardSubscribers({
      boardId: 'b1',
      type: 'cell_updated',
      taskId: 't1',
      actorId: 'actor',
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', reason: 'watching_item' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/server/utils/boardNotifications.test.ts -t reason
```
Expected: FAIL — `reason` not present on call args.

- [ ] **Step 3: Pass reason to createNotification in `notifyBoardSubscribers`**

In `server/utils/boardNotifications.ts`, update the in-app notification block (currently `:90-114`) to include reason:

```ts
// In-app notifications
await Promise.allSettled(
  inappSubscribers.map(sub =>
    createNotification({
      userId: sub.userId,
      type: mapEventToNotificationType(event.type),
      title,
      message,
      link,
      actorId: event.actorId,
      reason: sub.itemId ? 'watching_item' : 'watching_board',
      metadata: {
        boardId: event.boardId,
        boardName,
        taskId: event.taskId,
        taskTitle,
        columnId: event.columnId,
        eventType: event.type,
        changes: event.changes,
      },
    })
  )
)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/server/utils/boardNotifications.test.ts
```
Expected: PASS for both new cases; existing tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add server/utils/boardNotifications.ts test/server/utils/boardNotifications.test.ts
git commit -m "feat(notifications): infer watching_board vs watching_item reason from scope"
```

---

## Task 7: List endpoint returns `reason`

**Files:**
- Modify: `server/api/notifications/index.get.ts:32-98`

- [ ] **Step 1: Add `reason` to the SELECT and the response mapping**

In `server/api/notifications/index.get.ts:32-51`, add `n.reason` to the SELECT:

```ts
notifications = await queryRows(`
  SELECT
    n.id,
    n.type,
    n.title,
    n.message,
    n.link,
    n.metadata,
    n.reason,
    n.is_read,
    n.read_at,
    n.created_at,
    tm.id as actor_id,
    tm.name as actor_name,
    tm.avatar_url as actor_avatar
  FROM notifications n
  LEFT JOIN team_members tm ON n.actor_id = tm.id
  WHERE ${whereClause}
  ORDER BY n.created_at DESC
  LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
`, [...params, limit, offset])
```

In the response mapping at line 80-95, add `reason`:

```ts
notifications: notifications.map(n => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  link: n.link || null,
  metadata: n.metadata || null,
  reason: n.reason || null,
  isRead: n.is_read,
  readAt: n.read_at,
  createdAt: n.created_at,
  actor: n.actor_id ? {
    id: n.actor_id,
    name: n.actor_name,
    avatarUrl: n.actor_avatar
  } : null
})),
```

- [ ] **Step 2: Smoke-test against dev server**

```bash
pnpm dev
```
In another shell:

```bash
curl -s -b "session=$SESSION_COOKIE" http://localhost:3000/api/notifications | jq '.notifications[0] | keys'
```
Expected: `reason` listed in the keys array.

- [ ] **Step 3: Commit**

```bash
git add server/api/notifications/index.get.ts
git commit -m "feat(notifications): expose reason in list endpoint"
```

---

## Task 8: Frontend type + composable

**Files:**
- Modify: `app/composables/useNotifications.ts:12-23`

- [ ] **Step 1: Add `reason` to the `Notification` interface**

```ts
interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  metadata: Record<string, any> | null
  reason: 'mentioned' | 'assigned' | 'watching_board' | 'watching_item' | 'direct' | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  actor: NotificationActor | null
}
```

- [ ] **Step 2: Verify type compiles**

```bash
pnpm nuxi typecheck app/composables/useNotifications.ts 2>&1 | head -20
```
Expected: no new errors introduced (pre-existing errors per CLAUDE.md are tolerated).

- [ ] **Step 3: Commit**

```bash
git add app/composables/useNotifications.ts
git commit -m "feat(notifications): add reason to frontend Notification type"
```

---

## Task 9: Render reason badge in inbox

**Files:**
- Modify: `app/components/NotificationsSlideover.vue:134-145`

- [ ] **Step 1: Add a `reasonBadge` helper inside `<script setup>`**

After the existing imports/composable destructuring in `app/components/NotificationsSlideover.vue:1-15`, add:

```ts
function reasonBadge(reason: string | null): { label: string; color: 'error' | 'info' | 'neutral'; variant: 'solid' | 'subtle' } | null {
  if (!reason || reason === 'direct') return null
  if (reason === 'mentioned') return { label: 'Mentioned', color: 'error', variant: 'solid' }
  if (reason === 'assigned') return { label: 'Assigned', color: 'info', variant: 'solid' }
  if (reason === 'watching_board' || reason === 'watching_item') {
    return { label: 'Watching', color: 'neutral', variant: 'subtle' }
  }
  return null
}
```

- [ ] **Step 2: Render the badge next to the title**

In `app/components/NotificationsSlideover.vue:134-145`, replace the Content block:

```vue
<!-- Content -->
<div class="flex-1 min-w-0">
  <div class="flex items-center gap-2">
    <p class="text-sm font-medium text-highlighted truncate">
      {{ notification.title }}
    </p>
    <UBadge
      v-if="reasonBadge(notification.reason)"
      :label="reasonBadge(notification.reason)!.label"
      :color="reasonBadge(notification.reason)!.color"
      :variant="reasonBadge(notification.reason)!.variant"
      size="xs"
    />
  </div>
  <p class="text-sm text-muted line-clamp-2">
    {{ notification.message }}
  </p>
  <p class="text-xs text-dimmed mt-1">
    {{ formatRelativeTime(notification.createdAt) }}
  </p>
</div>
```

- [ ] **Step 3: Smoke test**

Start dev server: `pnpm dev`. In the browser:
1. Trigger an `@mention` on a task → open inbox → expect red "Mentioned" badge.
2. Assign yourself a task from a colleague's account → open inbox → expect blue "Assigned" badge.
3. Watch a board (Subscribe → All activity) → have someone edit an item → expect grey "Watching" badge.
4. Existing notifications (reason=null) render with no badge.

- [ ] **Step 4: Commit**

```bash
git add app/components/NotificationsSlideover.vue
git commit -m "feat(notifications): render reason badge in inbox"
```

---

## Task 10: `subscribers.get.ts` adds `?summary=true` mode

**Files:**
- Modify: `server/api/agency/boards/[id]/subscribers.get.ts`

- [ ] **Step 1: Add summary branch**

Replace the entire body (currently lines 6-55) with:

```ts
import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const boardId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  await requireBoardAccess(event, boardId)

  const summary = query.summary === 'true' || query.summary === '1'

  try {
    if (summary) {
      // Distinct users only — board-level OR any item/column sub on this board.
      const top = await queryRows(`
        SELECT DISTINCT ON (tm.id)
          tm.id, tm.name, tm.avatar_url
        FROM board_subscriptions bs
        JOIN team_members tm ON bs.user_id = tm.id
        WHERE bs.board_id = $1 AND bs.is_muted = false
        ORDER BY tm.id, bs.created_at ASC
        LIMIT 3
      `, [boardId])

      const countRow = await queryOne(`
        SELECT COUNT(DISTINCT bs.user_id) AS count
        FROM board_subscriptions bs
        WHERE bs.board_id = $1 AND bs.is_muted = false
      `, [boardId])

      return {
        count: parseInt(countRow?.count || '0', 10),
        top: top.map(r => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url })),
      }
    }

    const rows = await queryRows(`
      SELECT bs.*,
        tm.name as user_name,
        tm.email as user_email,
        tm.avatar_url as user_avatar,
        t.title as item_title,
        cc.name as column_name
      FROM board_subscriptions bs
      JOIN team_members tm ON bs.user_id = tm.id
      LEFT JOIN tasks t ON bs.item_id = t.id
      LEFT JOIN custom_columns cc ON bs.column_id = cc.id
      WHERE bs.board_id = $1
      ORDER BY tm.name, bs.created_at DESC
    `, [boardId])

    return {
      subscribers: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        userAvatar: r.user_avatar,
        itemId: r.item_id,
        itemTitle: r.item_title,
        columnId: r.column_id,
        columnName: r.column_name,
        events: r.events,
        notifyInapp: r.notify_inapp,
        notifyEmail: r.notify_email,
        isMuted: r.is_muted,
        createdAt: r.created_at,
      })),
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return summary ? { count: 0, top: [] } : { subscribers: [] }
    }
    throw error
  }
})
```

- [ ] **Step 2: Smoke test**

```bash
pnpm dev
```

```bash
curl -s "http://localhost:3000/api/agency/boards/<BOARD_ID>/subscribers?summary=true" -b "session=$SESSION" | jq
```
Expected: `{ "count": N, "top": [{id, name, avatarUrl}, ...max 3] }`.

```bash
curl -s "http://localhost:3000/api/agency/boards/<BOARD_ID>/subscribers" -b "session=$SESSION" | jq '.subscribers | length'
```
Expected: full list still works.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/boards/\[id\]/subscribers.get.ts
git commit -m "feat(subscriptions): add ?summary=true mode for compact watcher count"
```

---

## Task 11: `BoardWatchSubscriberStack.vue`

**Files:**
- Create: `app/components/board/BoardWatchSubscriberStack.vue`

- [ ] **Step 1: Create the component**

```vue
<template>
  <div v-if="count > 0" class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-default">
    <div class="flex items-center gap-2">
      <div class="flex -space-x-2">
        <UAvatar
          v-for="user in top"
          :key="user.id"
          :src="user.avatarUrl || undefined"
          :alt="user.name"
          size="2xs"
          class="ring-2 ring-default"
        />
      </div>
      <span class="text-xs text-muted">
        {{ count }} watching
      </span>
    </div>
    <UButton
      label="View"
      variant="ghost"
      size="xs"
      color="neutral"
      @click="showAll = true"
    />

    <UModal v-model:open="showAll">
      <template #content>
        <div class="p-4">
          <h3 class="text-sm font-semibold mb-3">Watching this board</h3>
          <div v-if="full.length === 0" class="text-sm text-muted">Loading…</div>
          <div v-else class="space-y-2 max-h-96 overflow-y-auto">
            <div v-for="sub in distinctFull" :key="sub.userId" class="flex items-center gap-2">
              <UAvatar :src="sub.userAvatar || undefined" :alt="sub.userName" size="sm" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ sub.userName }}</p>
                <p class="text-xs text-muted truncate">{{ sub.userEmail }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ boardId: string }>()

interface TopUser { id: string; name: string; avatarUrl: string | null }
interface FullSub { userId: string; userName: string; userEmail: string; userAvatar: string | null }

const count = ref(0)
const top = ref<TopUser[]>([])
const full = ref<FullSub[]>([])
const showAll = ref(false)

const distinctFull = computed(() => {
  const seen = new Set<string>()
  return full.value.filter(s => {
    if (seen.has(s.userId)) return false
    seen.add(s.userId)
    return true
  })
})

async function loadSummary() {
  try {
    const data = await $fetch<{ count: number; top: TopUser[] }>(
      `/api/agency/boards/${props.boardId}/subscribers?summary=true`
    )
    count.value = data.count
    top.value = data.top
  } catch {
    // silently no-op — non-critical
  }
}

watch(showAll, async (open) => {
  if (open && full.value.length === 0) {
    try {
      const data = await $fetch<{ subscribers: FullSub[] }>(
        `/api/agency/boards/${props.boardId}/subscribers`
      )
      full.value = data.subscribers
    } catch {
      full.value = []
    }
  }
})

defineExpose({ refresh: loadSummary })

onMounted(loadSummary)
</script>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/board/BoardWatchSubscriberStack.vue
git commit -m "feat(boards): subscriber stack component for Watch popover"
```

---

## Task 12: `BoardWatchSettings.vue` (Custom modal)

**Files:**
- Create: `app/components/board/BoardWatchSettings.vue`

- [ ] **Step 1: Create the component**

```vue
<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-5 space-y-4">
        <h3 class="text-base font-semibold">Notification Settings</h3>

        <URadioGroup v-model="preset" :items="presetItems" />

        <div v-if="preset === 'custom'" class="space-y-3 pl-1 border-l-2 border-default">
          <p class="text-xs font-medium text-muted uppercase tracking-wide pl-2">Notify me about</p>
          <div class="pl-2 space-y-2">
            <UCheckbox v-for="g in groups" :key="g.key" v-model="selectedGroups[g.key]" :label="g.label" />
          </div>
        </div>

        <div class="pt-2 border-t border-default">
          <UCheckbox v-model="emailEnabled" label="Also send email" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
          <UButton label="Save" color="primary" :loading="saving" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ boardId: string }>()
const emit = defineEmits<{ saved: [{ subscribed: boolean; level: string | null }] }>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const GROUPS = {
  items:     { key: 'items',     label: 'Items (created / updated / deleted)', events: ['task_created', 'task_updated', 'task_deleted'] },
  status:    { key: 'status',    label: 'Status moves', events: ['status_changed'] },
  fields:    { key: 'fields',    label: 'Field edits', events: ['cell_updated'] },
  people:    { key: 'people',    label: 'People (assigned, @mentioned)', events: ['task_assigned', 'task_mentioned'] },
  structure: { key: 'structure', label: 'Structure (groups, columns)', events: ['group_updated', 'column_updated'] },
} as const

type GroupKey = keyof typeof GROUPS
const groups = Object.values(GROUPS)

const presetItems = [
  { value: 'all', label: 'All activity' },
  { value: 'mentions', label: 'Mentions only' },
  { value: 'muted', label: 'Muted' },
  { value: 'custom', label: 'Custom' },
]

const preset = ref<'all' | 'mentions' | 'muted' | 'custom'>('all')
const selectedGroups = reactive<Record<GroupKey, boolean>>({
  items: true, status: true, fields: false, people: true, structure: false,
})
const emailEnabled = ref(false)
const saving = ref(false)

function eventsToGroups(events: string[]): { groups: Record<GroupKey, boolean>; matchesPreset: 'all' | 'mentions' | null } {
  if (events.length === 0) return { groups: { items: true, status: true, fields: true, people: true, structure: true }, matchesPreset: 'all' }
  if (events.length === 1 && events[0] === 'task_mentioned') {
    return { groups: { items: false, status: false, fields: false, people: true, structure: false }, matchesPreset: 'mentions' }
  }
  const result = { items: false, status: false, fields: false, people: false, structure: false } as Record<GroupKey, boolean>
  for (const k of Object.keys(GROUPS) as GroupKey[]) {
    const groupEvents = GROUPS[k].events as readonly string[]
    if (groupEvents.every(e => events.includes(e))) result[k] = true
  }
  return { groups: result, matchesPreset: null }
}

function groupsToEvents(): string[] {
  const out: string[] = []
  for (const k of Object.keys(GROUPS) as GroupKey[]) {
    if (selectedGroups[k]) out.push(...GROUPS[k].events)
  }
  // If everything is selected, send empty array (= "all events").
  const allEvents = Object.values(GROUPS).flatMap(g => g.events as readonly string[])
  if (out.length === allEvents.length) return []
  return out
}

async function hydrate() {
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(
      `/api/agency/boards/${props.boardId}/subscriptions`
    )
    const boardSub = subscriptions.find((s: any) => !s.itemId && !s.columnId)
    if (!boardSub) {
      preset.value = 'custom'
      Object.assign(selectedGroups, { items: true, status: true, fields: false, people: true, structure: false })
      emailEnabled.value = false
      return
    }
    if (boardSub.isMuted) {
      preset.value = 'muted'
      emailEnabled.value = !!boardSub.notifyEmail
      return
    }
    const { groups: g, matchesPreset } = eventsToGroups(boardSub.events || [])
    Object.assign(selectedGroups, g)
    preset.value = matchesPreset || 'custom'
    emailEnabled.value = !!boardSub.notifyEmail
  } catch {
    // non-critical — leave defaults
  }
}

watch(open, (isOpen) => {
  if (isOpen) hydrate()
})

// When the user toggles a group, flip preset to "custom" automatically.
watch(selectedGroups, () => {
  if (preset.value !== 'custom') preset.value = 'custom'
}, { deep: true })

async function save() {
  saving.value = true
  try {
    if (preset.value === 'muted') {
      await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
        method: 'POST',
        body: { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: true },
      })
      emit('saved', { subscribed: true, level: 'muted' })
    } else if (preset.value === 'all') {
      await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
        method: 'POST',
        body: { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false },
      })
      emit('saved', { subscribed: true, level: 'all' })
    } else if (preset.value === 'mentions') {
      await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
        method: 'POST',
        body: { events: ['task_mentioned'], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false },
      })
      emit('saved', { subscribed: true, level: 'mentions' })
    } else {
      const events = groupsToEvents()
      // If user unchecked everything, treat as muted to avoid "subscribed but receives nothing" footgun.
      if (events.length === 0 && !Object.values(selectedGroups).some(v => v)) {
        await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
          method: 'POST',
          body: { events: [], notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: true },
        })
        emit('saved', { subscribed: true, level: 'muted' })
      } else {
        await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
          method: 'POST',
          body: { events, notifyInapp: true, notifyEmail: emailEnabled.value, isMuted: false },
        })
        emit('saved', { subscribed: true, level: 'custom' })
      }
    }
    open.value = false
  } catch (err: any) {
    toast.add({
      title: 'Could not save notification settings',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/board/BoardWatchSettings.vue
git commit -m "feat(boards): custom event picker modal for board Watch"
```

---

## Task 13: Wire stack + modal into `BoardHeader.vue`

**Files:**
- Modify: `app/components/board/BoardHeader.vue:23-47, 115-156`

- [ ] **Step 1: Update the popover to include subscriber stack and Custom… option**

Replace the popover block at lines 23-47:

```vue
<UPopover>
  <UButton
    :icon="isSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
    :variant="isSubscribed ? 'soft' : 'ghost'"
    :color="isSubscribed ? 'primary' : 'neutral'"
    size="sm"
  >
    {{ isSubscribed ? 'Watching' : 'Watch' }}
  </UButton>
  <template #content>
    <div class="p-3 w-72 space-y-1">
      <BoardWatchSubscriberStack :board-id="boardId" />
      <p class="text-sm font-medium px-2">Board Notifications</p>
      <div
        v-for="opt in subscribeOptions"
        :key="opt.value"
        class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
        @click="handleSubscribe(opt.value)"
      >
        <UIcon :name="opt.icon" class="w-4 h-4" />
        <span>{{ opt.label }}</span>
        <UIcon v-if="subscriptionLevel === opt.value" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
      </div>
      <div class="border-t border-default mt-1 pt-1">
        <div
          class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
          @click="openSettings = true"
        >
          <UIcon name="i-lucide-settings-2" class="w-4 h-4" />
          <span>Custom…</span>
          <UIcon v-if="subscriptionLevel === 'custom'" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
        </div>
      </div>
    </div>
  </template>
</UPopover>

<BoardWatchSettings
  v-model:open="openSettings"
  :board-id="boardId"
  @saved="onSettingsSaved"
/>
```

- [ ] **Step 2: Add `openSettings` state and `onSettingsSaved` handler**

In the `<script setup>` block, after `subscriptionLevel` (line 113):

```ts
const openSettings = ref(false)

function onSettingsSaved(payload: { subscribed: boolean; level: string | null }) {
  isSubscribed.value = payload.subscribed
  subscriptionLevel.value = payload.level
}
```

Update the on-mount detection (line 121-134) to recognise the "custom" state:

```ts
onMounted(async () => {
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(`/api/agency/boards/${props.boardId}/subscriptions`)
    const boardSub = subscriptions.find((s: any) => !s.itemId && !s.columnId)
    if (boardSub) {
      isSubscribed.value = true
      if (boardSub.isMuted) {
        subscriptionLevel.value = 'muted'
      } else if (!boardSub.events || boardSub.events.length === 0) {
        subscriptionLevel.value = 'all'
      } else if (boardSub.events.length === 1 && boardSub.events[0] === 'task_mentioned') {
        subscriptionLevel.value = 'mentions'
      } else {
        subscriptionLevel.value = 'custom'
      }
    }
  } catch {
    // Silently fail — subscription check is non-critical
  }
})
```

- [ ] **Step 3: Smoke test in dev server**

```bash
pnpm dev
```

In the browser:
1. Open a board → Watch button → see "N watching" header (when ≥1).
2. Click "All activity" → button flips to "Watching" with check on All.
3. Click "Custom…" → modal opens, prefilled with All preset.
4. Switch to "Custom" radio, uncheck Field edits, check Email → Save → modal closes, popover shows check next to Custom….
5. Reload page → opening popover again shows the same Custom selection persisted.
6. Click "Mentions only" → check moves; reload → still on Mentions only.
7. Trigger a `cell_updated` from another account → first user (only Items+Status checked) does NOT receive the notification. Second user (default All) DOES receive it.
8. Trigger a `status_changed` → first user receives it.

- [ ] **Step 4: Commit**

```bash
git add app/components/board/BoardHeader.vue
git commit -m "feat(boards): wire Custom modal and subscriber stack into Watch popover"
```

---

## Task 14: Marketing-page sync (per CLAUDE.md)

**Files:**
- Inspect: `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue`

- [ ] **Step 1: Search for existing Watch / Notification feature copy**

```bash
grep -rn "Watch\|Subscribe\|Notification" app/pages/features app/components/MarketingNav.vue 2>/dev/null
```

- [ ] **Step 2: Update or add a feature entry**

If a "Notifications" / "Watch" feature card already exists, update its description to reflect:
- Custom event subscriptions (5 categories)
- Per-board email toggle
- Notification reasons in inbox
- Subscriber visibility

If it doesn't exist, add a feature entry under the "Collaboration" or "Productivity" category in `app/pages/features/index.vue`, and a detailed page section in `app/pages/features/[slug].vue` following the existing 3–4 content section pattern.

- [ ] **Step 3: Commit**

```bash
git add app/pages/features/
git commit -m "docs(marketing): document new Watch / Notification capabilities"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run all tests**

```bash
pnpm vitest run
```
Expected: all green; new tests cover reason propagation, getSubscribers itemId, board reason inference.

- [ ] **Step 2: Type-check**

```bash
pnpm nuxi typecheck 2>&1 | grep -v "node_modules" | tail -30
```
Expected: no NEW type errors introduced beyond the ~60 pre-existing per CLAUDE.md.

- [ ] **Step 3: Per-CLAUDE.md pre-commit review**

Re-read every file modified in this plan. Specifically verify:
- All API calls use absolute paths and proper auth (`requireBoardAccess`)
- `USelectMenu` / `UCheckbox` values never empty strings
- Server endpoints use `~~/server/utils/` imports, not `~/server/utils/`
- No XSS vectors introduced (subscriber names are rendered with text interpolation, safe)
- Modal `UCheckbox` truthiness is reactive (toggling triggers preset → custom)
- Migration ran successfully against the live DB

- [ ] **Step 4: Confirm completion**

Acceptance criteria from the spec:
- [x] New notifications carry a `reason` value matching the dispatch context (Tasks 2-6)
- [x] Existing notifications continue to render (with no badge) (Task 9 — `reasonBadge` returns null)
- [x] Watch popover shows subscriber count + 3 avatars when ≥1 watcher (Tasks 10-13)
- [x] "Custom…" opens modal, save persists, reload reflects saved state (Tasks 12-13)
- [x] Choosing only "Status moves" group results in user receiving status notifications and not field-edit notifications (verified in Task 13 smoke test)
- [x] Email toggle flips `notify_email` correctly (Task 12)
- [x] Existing All / Mentions / Muted presets still work as before (Task 13)

---

## Self-review checklist (post-plan)

- ✅ Spec coverage: all 7 acceptance criteria mapped to tasks.
- ✅ No placeholders — every code block is concrete.
- ✅ Type consistency: `reason` enum identical across migration, types, helpers.
- ✅ Migration runs before code that references the column (Task 1 first).
- ✅ Tests precede implementation in TDD steps (Tasks 2-6).
- ✅ One conceptual change per commit (15 commits across 14 tasks).
