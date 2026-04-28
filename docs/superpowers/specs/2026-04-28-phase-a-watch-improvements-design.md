# Phase A — Board Watch Improvements

**Date:** 2026-04-28
**Status:** Approved (design)
**Scope:** Three improvements to the existing board "Watch" / Board Notifications feature.

## Motivation

The Watch dropdown in `app/components/board/BoardHeader.vue` exposes only three coarse options (All / Mentions / Muted). The underlying schema and dispatcher are far richer than the UI surface:

- `board_subscriptions` already holds `events[]`, `notify_inapp`, `notify_email`, `is_muted`, plus per-item and per-column scope.
- `getSubscribers()` already filters dispatch by event type (`events @> ARRAY[$N]`).
- `subscribers.get.ts` already returns the watcher list.

Users can't see *why* they were notified, can't pick which event types matter, and can't tell who else is watching. The result is the classic notification-fatigue → mute-everything reflex documented across Slack, Monday, and Linear UX articles.

Phase A delivers the three highest-impact UX wins without expanding subscription scope. Items added in later phases (item-level watch, snooze, auto-watch, digest, quiet hours, keywords) reuse the components and reason taxonomy introduced here.

## Out of scope (Phase A)

- Item-level Watch button (Phase B)
- Snooze / quiet hours (Phase B / C)
- Auto-watch on participation (Phase B)
- Email or in-app digests (Phase C)
- Keyword subscriptions (Phase D)
- Slack / Teams routing (dropped — keep everything in-house)

## Features

### F1 — Notification reason tag

Surfaces *why* the user got each notification, in the inbox.

**Schema**

```sql
ALTER TABLE notifications ADD COLUMN reason TEXT;
```

Column, not JSON, so we can index/filter on it later (Phase B "Show only mentions" facet).

**Reason enum**

| Value | Trigger |
|---|---|
| `mentioned` | user appears in `@mention` extraction for the event |
| `assigned` | event is `task_assigned` and the user is the new assignee |
| `watching_board` | board-level subscription matched (`item_id IS NULL AND column_id IS NULL`) |
| `watching_item` | item-level subscription matched (forward-compat with Phase B) |
| `direct` | system notifications that don't fit the above (e.g. `board_member_added`) |

**Dispatch change**

Reason is determined per-call-site, not centrally inferred:

| Call site | Reason set to |
|---|---|
| `notifyBoardSubscribers` (board-level dispatch) | `watching_item` if matched sub has `item_id`, else `watching_board` |
| `notifyTaskAssigneeChanged` | `assigned` |
| Mention extraction (`task_mentioned` path) | `mentioned` |
| `notifyBoardMemberAdded` and other system notifications | `direct` |

In `notifyBoardSubscribers`, `getSubscribers()` is extended to return `item_id` per matched row so the dispatcher can branch on scope. `getSubscribers()` already deduplicates with `DISTINCT ON (bs.user_id) … ORDER BY bs.user_id, bs.item_id NULLS LAST` — that ordering means item-level subs win over board-level, which gives correct precedence (`watching_item` outranks `watching_board`).

`createNotification()` accepts a new optional `reason` parameter and stores it on the row.

**UI**

`UBadge` rendered next to the notification title in the inbox notification card.

| Reason | Color | Variant | Label |
|---|---|---|---|
| `mentioned` | `error` | `solid` | "Mentioned" |
| `assigned` | `info` | `solid` | "Assigned" |
| `watching_board` | `neutral` | `subtle` | "Watching" |
| `watching_item` | `neutral` | `subtle` | "Watching" |
| `direct` | — | — | (no badge) |

Backfill: none. Existing rows have `reason = NULL` and render without a badge.

### F2 — Custom event picker modal

Lets users choose which event types they get notified about, plus toggle email per-board.

**Trigger**

Append a fourth option to the existing Watch popover:

```
○ All activity
○ Mentions only
○ Muted
─────────────
✎ Custom…
```

Clicking "Custom…" opens a `UModal`.

**Modal layout**

```
┌─ Board Notifications ──────────────────┐
│  ○ All activity                        │
│  ○ Mentions only                       │
│  ● Custom                              │
│  ─────────────────────────────────     │
│  Notify me about:                      │
│  ☑ Items (created / updated / deleted) │
│  ☑ Status moves                        │
│  ☐ Field edits                         │
│  ☑ People (assigned, @mentioned)       │
│  ☐ Structure (groups, columns)         │
│  ─────────────────────────────────     │
│  ☑ Also send email                     │
│  ─────────────────────────────────     │
│           [Cancel]  [Save]             │
└────────────────────────────────────────┘
```

**Group → event mapping**

```ts
const GROUPS = {
  items:     ['task_created', 'task_updated', 'task_deleted'],
  status:    ['status_changed'],
  fields:    ['cell_updated'],
  people:    ['task_assigned', 'task_mentioned'],
  structure: ['group_updated', 'column_updated'],
}
```

**Wire to existing endpoint** — `POST /api/agency/boards/{id}/subscribe` with the flattened `events[]` array and `isMuted: false`. `getSubscribers()` already supports per-event filtering.

**Save semantics** — explicit Save button (one network call, no race on rapid toggles). Cancel discards. State is hydrated from `GET /api/agency/boards/{id}/subscriptions` when the modal opens.

**Pre-fill rules**

| Stored state | Modal pre-selection |
|---|---|
| no subscription | all 5 groups checked, email off, "Custom" radio |
| `events = []`, `is_muted=false` | matches "All activity" preset radio |
| `events = ['task_mentioned']` | matches "Mentions only" preset radio |
| `is_muted = true` | matches "Muted" preset radio |
| any other event combination | "Custom" radio, groups checked to match |

**Component** — new `app/components/board/BoardWatchSettings.vue`, mounted from `BoardHeader.vue`'s Watch popover. Emits `update:level` with the resolved level after save.

### F3 — Subscriber count + avatar stack

Shows users who else is watching.

**Data source** — existing `GET /api/agency/boards/{id}/subscribers` returns the watcher list. Add an `?summary=true` query parameter that returns `{ count, top: [{id, name, avatar}, ...3] }` instead of the full list, to avoid shipping all rows when we only need 3 + a count.

**UI changes to Watch popover header**

```
┌─ Board Notifications ──────────────────┐
│  👤👤👤 +5 watching             [View]  │ ← new header row
│  ─────────────────────────────────     │
│  ○ All activity                        │
│  ...                                   │
└────────────────────────────────────────┘
```

Avatars: first 3, then "+N" suffix when count > 3. "View" link opens a `UModal` listing all subscribers (uses the existing un-summarised endpoint).

**Visibility threshold** — render the row when `count >= 1`. Hide entirely when 0.

**Watch button itself** — unchanged. No count badge on the button (keeps the header chrome clean; count lives inside the popover where users are already deciding what to do).

## Architecture

```
BoardHeader.vue
 └── (existing) Watch UPopover
      ├── (new) BoardWatchSubscriberStack — Feature 3
      ├── 4 radio options (existing 3 + "Custom…")
      └── (new) BoardWatchSettings.vue — Feature 2
           └── opens UModal

server/utils/boardNotifications.ts
 └── notifyBoardSubscribers
      ├── getSubscribers()                     — unchanged
      ├── (new) determineReason(sub, event)
      └── createNotification({ ...sub, reason }) — Feature 1
```

## Data flow (notification with reason)

**Watching-path** (board edit triggers cell/status/structure event):

1. User edits a cell → `tasks/[id].put.ts` calls `notifyBoardSubscribers({ type: 'cell_updated', ... })`
2. `getSubscribers()` returns matched user rows with `item_id` populated when matched at item scope (NULL when matched at board scope)
3. Dispatcher sets reason per row: `sub.item_id` set → `watching_item`, else → `watching_board`
4. `createNotification({ ..., reason })` stores the row.
5. Inbox renders badge based on `reason`.

**Direct-path** (mention / assignment / system):

- `task_mentioned` extraction calls `createNotification({ ..., reason: 'mentioned' })` directly.
- `notifyTaskAssigneeChanged` calls `createNotification({ ..., reason: 'assigned' })` directly.
- `notifyBoardMemberAdded` and other system notifications pass `reason: 'direct'` (or omit, rendering no badge).

## Testing

**Unit**
- `determineReason(sub, event)` — every reason branch covered.
- `BoardWatchSettings` group → events flattening (5 group selection states × email on/off).

**Integration**
- Subscribe via Custom (only `status_changed`) → fire `cell_updated` → user does NOT receive notification.
- Subscribe via Custom (only `status_changed`) → fire `status_changed` → user receives `watching_board` reason.
- Subscribe board-level + another user item-level on the same task → fire `cell_updated` → both notified, item-level user has `reason = watching_item`.

**UI**
- Watch popover with 0 / 1 / 4 / 12 subscribers — verify avatar stack render.
- Modal opens prefilled to current state, saves correctly, cancel discards.

## Migration

Single migration file: `server/database/migrations/0XX_notifications_reason.sql`

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reason TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_reason ON notifications(user_id, reason) WHERE reason IS NOT NULL;
```

Index supports the upcoming Phase B "filter by reason" facet.

Run via the project's standard migration command (per CLAUDE.md):

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/0XX_notifications_reason.sql
```

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `getSubscribers()` modification breaks existing dispatch | Low | Additive change — extend SELECT to include `bs.item_id`; existing callers ignore the extra field |
| Modal save races with popover close | Low | Save button is sole commit path; popover doesn't close until save resolves |
| User confusion: "Custom" vs preset radios staying in sync | Medium | When user toggles a checkbox that doesn't match any preset, radio auto-flips to "Custom" |
| Avatar stack queries on every popover open | Low | Use existing `setCacheHeaders` on the summary endpoint (60s) |

## Front-facing pages sync (per CLAUDE.md)

If the marketing site lists "Notification customization" or "Watch" as a feature:
- Update `app/pages/features/[slug].vue` with the new Custom event picker capability
- Update `app/pages/features/index.vue` if Watch is its own feature card

## Acceptance criteria

- [ ] New notifications carry a `reason` value matching the dispatch context
- [ ] Existing notifications continue to render (with no badge)
- [ ] Watch popover shows subscriber count + 3 avatars when ≥1 watcher
- [ ] "Custom…" opens modal, save persists, reload reflects saved state
- [ ] Choosing only "Status moves" group results in user receiving status notifications and not field-edit notifications
- [ ] Email toggle flips `notify_email` correctly
- [ ] Existing All / Mentions / Muted presets still work as before
