# Phase B — Board Watch Improvements Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add snooze, item-level Watch, My Subscriptions page, and auto-watch on participation.
**Spec:** `docs/superpowers/specs/2026-04-28-phase-b-watch-improvements-design.md`
**Builds on:** Phase A patterns (BoardWatchSettings modal, reason badges, subscriber stack, classifyLevel helper).

---

## Task 1 — Migration 078

- [ ] Write `server/database/migrations/078-watch-phase-b.sql` (snooze_until, auto_subscribe_on_participation, snooze index).
- [ ] Run via `psql "$DATABASE_URL" -f server/database/migrations/078-watch-phase-b.sql`.
- [ ] Verify columns: `psql "$DATABASE_URL" -c "\d board_subscriptions" | grep snooze` and same for team_members.
- [ ] Commit.

## Task 2 — Backend snooze filter

**Files:** `server/utils/subscriptions.ts`, `test/server/utils/boardNotificationsReason.test.ts` (extend).

- [ ] Update `getSubscribers()` SQL conditions to add `(bs.snooze_until IS NULL OR bs.snooze_until <= NOW())`.
- [ ] Test: a subscriber with `snooze_until` in the future should NOT appear; one in the past or NULL should.
- [ ] Commit.

## Task 3 — Backend snooze accept/return

**Files:** `server/api/agency/boards/[id]/subscribe.post.ts`, `server/api/agency/boards/[id]/subscriptions.get.ts`.

- [ ] `subscribe.post.ts`: accept optional `snoozeUntil: string | null` in body. Parse to Date or null. Add to INSERT and ON CONFLICT UPDATE. Default null when not provided.
- [ ] `subscriptions.get.ts`: include `bs.snooze_until` in SELECT and return as `snoozeUntil` in the mapped response.
- [ ] Commit.

## Task 4 — Auto-subscribe helper with preference check

**Files:** `server/utils/subscriptions.ts`.

- [ ] Add `autoSubscribeIfEnabled(userId, boardId, itemId?)` that reads `auto_subscribe_on_participation` from `team_members` and skips if false.
- [ ] Commit.

## Task 5 — Wire auto-subscribe into dispatch sites

**Files:**
- `server/api/agency/tasks/index.post.ts` (task create)
- `server/api/agency/tasks/[id].put.ts` (assignee change)
- `server/utils/notifications.ts` (notifyMention)
- Comment endpoints (search: `grep -rn "INSERT INTO comments\|task_comment" server/api`)

- [ ] After successful task create, call `autoSubscribeIfEnabled(creatorId, boardId, taskId)`.
- [ ] After assignee change in `tasks/[id].put.ts`, call for new assignee. (Use the existing assignee-change branch.)
- [ ] In `notifyMention`, after the createNotification call, also call `autoSubscribeIfEnabled(mentionedUserId, boardId, taskId)` — needs the boardId in scope, look it up from the task.
- [ ] In comment-creation endpoints, call for the commenter.
- [ ] Each call wrapped in try/catch — auto-subscribe failure must not break the primary action.
- [ ] Commit.

## Task 6 — Notification preferences PUT field

**Files:** `server/api/notifications/preferences.put.ts`.

- [ ] Accept `autoSubscribeOnParticipation: boolean` in body.
- [ ] Update `team_members.auto_subscribe_on_participation` directly (it's a column now, not in `notification_preferences` JSON).
- [ ] Mirror in `preferences.get.ts` so the settings page hydrates.
- [ ] Commit.

## Task 7 — Snooze in BoardHeader popover

**Files:** `app/components/board/BoardHeader.vue`.

- [ ] Add snooze options to the popover. Render between subscriber stack and preset list:

```vue
<div class="border-b border-default mb-1 pb-1">
  <div v-if="snoozeUntil && new Date(snoozeUntil) > new Date()" class="px-2 py-1.5 flex items-center gap-2 text-sm">
    <UIcon name="i-lucide-moon" class="w-4 h-4 text-warning" />
    <span class="text-muted">Snoozed until {{ formatSnoozeRelative(snoozeUntil) }}</span>
    <UButton label="Cancel" variant="ghost" size="2xs" color="neutral" class="ml-auto" @click="cancelSnooze" />
  </div>
  <div v-else class="px-2 py-1">
    <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Snooze</p>
    <div class="flex flex-wrap gap-1">
      <UButton label="1h" variant="ghost" size="2xs" color="neutral" @click="snoozeFor(60)" />
      <UButton label="8h" variant="ghost" size="2xs" color="neutral" @click="snoozeFor(60 * 8)" />
      <UButton label="Tomorrow" variant="ghost" size="2xs" color="neutral" @click="snoozeUntilTomorrow8am()" />
    </div>
  </div>
</div>
```

- [ ] Add `snoozeUntil` ref, populate in `onMounted` from `boardSub.snoozeUntil`.
- [ ] `snoozeFor(minutes)` helper: posts to `/subscribe` with `snoozeUntil` set to `new Date(Date.now() + minutes * 60_000).toISOString()` and current other settings preserved.
- [ ] `snoozeUntilTomorrow8am()`: compute next 8 AM in user timezone (use `Intl.DateTimeFormat` to get current TZ, or hard-default Australia/Sydney).
- [ ] `cancelSnooze()`: posts `snoozeUntil: null` preserving other settings.
- [ ] When `snoozeUntil` is active, change Watch button label to "Snoozed" with `i-lucide-moon` icon.
- [ ] Commit.

## Task 8 — Item-level Watch button

**Files:** `app/components/board/BoardWatchSettings.vue` (extend), task panel header file (search: `grep -rn "task-panel\|TaskPanel\|task-detail" app/components`).

- [ ] Add `itemId?: string` prop to `BoardWatchSettings.vue`.
- [ ] Hydration: when `props.itemId` is set, find the sub matching `s.itemId === props.itemId` (instead of board-level).
- [ ] Save: when `props.itemId` is set, include `itemId: props.itemId` in body.
- [ ] Title: "Item Notifications" when itemId set, else "Board Notifications".
- [ ] Find the task detail panel component. Add a small Watch button (mirrors BoardHeader Watch UPopover pattern but item-scoped) in the panel header.
- [ ] Commit.

## Task 9 — Aggregated subscriptions endpoint

**Files:** `server/api/notifications/subscriptions.get.ts` (new).

- [ ] Single endpoint returning all current-user subs across all boards.
- [ ] SQL joins `board_subscriptions` with `departments` (boards) and `tasks` (items) and `custom_columns`.
- [ ] Computes `preset` server-side using same classifier as Phase A frontend (all/mentions/custom/muted).
- [ ] Computes `scope` as 'board' | 'item' | 'column'.
- [ ] Order by board name then created_at.
- [ ] Commit.

## Task 10 — My Subscriptions page

**Files:** `app/pages/agency/notifications/watching.vue` (new), sidebar nav file (search: `grep -rn "notifications" app/components/.*Sidebar\|app/layouts`).

- [ ] Create page using `UTable` listing all subscriptions.
- [ ] Columns: Board, Scope (with item/column name if applicable), Preset (UBadge color-coded), Email (UCheckbox toggle, calls subscribe), Snooze (relative time), Actions (Unwatch button).
- [ ] Filter pills above table for scope filter (All / Boards / Items / Columns).
- [ ] Search input filters client-side by board name.
- [ ] Sidebar entry under Notifications: "Watching" linking to /agency/notifications/watching.
- [ ] Commit.

## Task 11 — Settings toggle for auto-subscribe

**Files:** `app/pages/settings/notifications.vue`.

- [ ] Add `UCheckbox` "Auto-subscribe to items I create, comment on, am assigned to, or am @mentioned in" with description.
- [ ] Hydrate from `GET /api/notifications/preferences` field.
- [ ] On change, PUT to update.
- [ ] Commit.

## Task 12 — Tests

**Files:** existing `boardNotificationsReason.test.ts`, new `subscriptions.test.ts` if absent.

- [ ] Test: snoozed subscriber (snooze_until in future) is NOT returned by `getSubscribers`.
- [ ] Test: snoozed subscriber with snooze_until in past IS returned.
- [ ] Test: `autoSubscribeIfEnabled` skips when user pref is false.
- [ ] Test: `autoSubscribeIfEnabled` calls autoSubscribe when pref is true or missing.
- [ ] Run `pnpm vitest run` — confirm no regressions.
- [ ] Commit.

## Task 13 — Final verification

- [ ] Smoke test: full Phase B flow in a real browser.
- [ ] Pre-commit review per CLAUDE.md.
- [ ] Confirm acceptance criteria from spec.
