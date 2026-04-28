# Phase B — Board Watch Improvements

**Date:** 2026-04-28
**Status:** Approved (design)
**Builds on:** Phase A (`2026-04-28-phase-a-watch-improvements-design.md`)

## Scope (4 features)

1. **Snooze** — board-level, with options 1h / 8h / Tomorrow 8am / Custom / Cancel.
2. **Item-level Watch** — bell button on task panel reusing the Phase A `BoardWatchSettings` modal.
3. **My Subscriptions page** — `/agency/notifications/watching` listing every subscription with bulk unwatch.
4. **Auto-watch on participation** — auto-subscribe at item scope on task creation, comment, assignment, or @mention. User preference to opt out.

## Migration

`server/database/migrations/078-watch-phase-b.sql`:

```sql
ALTER TABLE board_subscriptions ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS auto_subscribe_on_participation BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_board_subscriptions_snooze
  ON board_subscriptions(user_id, snooze_until) WHERE snooze_until IS NOT NULL;
```

## Feature 1 — Snooze

**Backend**
- `getSubscribers()` adds `(bs.snooze_until IS NULL OR bs.snooze_until <= NOW())` to its `WHERE` (alongside `is_muted = false`).
- `subscribe.post.ts` accepts optional `snoozeUntil: string | null` (ISO timestamp). Stored on the row; clearing snooze means passing `snoozeUntil: null`.
- `subscriptions.get.ts` returns `snoozeUntil` on each subscription row.

**UI**
- Watch popover gets a Snooze section between subscriber stack and the preset list. Shows current snooze remaining if active, or 4 quick options:
  - 1 hour
  - 8 hours
  - Tomorrow 8 AM (user's timezone, default Australia/Sydney)
  - Custom (UCalendar + time input)
  - Cancel snooze (only when active)
- While snoozed, Watch button label flips to "Snoozed (Xh left)" with a moon icon.

**Reason for board-level**: per-notification snooze is a future Phase E concern; for now, "I want this board quiet for a couple hours" covers 90% of need.

## Feature 2 — Item-level Watch

**UI**
- Find the existing task detail panel (component used in board task view).
- Add a small `UButton` with bell icon (or `UPopover` mirroring `BoardHeader`'s Watch button) in its header.
- On click, opens the existing `BoardWatchSettings` modal with `itemId` prop populated. The modal already accepts `itemId` semantically — we extend it to optionally read/write item-level subscriptions instead of board-level.

**Backend** — no changes. `subscribe.post.ts` already handles `itemId` in the body; `subscriptions.get.ts` already returns per-item rows.

**Component change** — `BoardWatchSettings.vue` gains an optional `itemId?: string` prop. When set:
- Hydration finds the matching item-level sub (`s.itemId === itemId`).
- Save sends `itemId` in the POST body.
- Title changes from "Board Notifications" to "Item Notifications".

## Feature 3 — My Subscriptions page

**Route** — `app/pages/agency/notifications/watching.vue`. Sidebar entry under Notifications.

**Layout**
- Header: "Watching" title + count
- Filter row: scope (All / Boards / Items / Columns), search by board name
- Table grouped by board (using existing `UTable` patterns), columns:
  - Scope (board / item / column with name)
  - Preset (All / Mentions / Custom / Muted)
  - Email (boolean)
  - Snooze (relative time or "—")
  - Actions (Unwatch button)

**Endpoint** — extend `GET /api/agency/boards/.../subscriptions` is per-board; we need a new aggregated endpoint:

`GET /api/notifications/subscriptions` — returns all subs for current user across boards, with board name and item title joined.

```ts
{
  subscriptions: [
    {
      id, boardId, boardName,
      itemId, itemTitle,
      columnId, columnName,
      scope: 'board' | 'item' | 'column',
      preset: 'all' | 'mentions' | 'custom' | 'muted',
      events, notifyInapp, notifyEmail,
      snoozeUntil,
      createdAt
    }
  ]
}
```

The `preset` is computed server-side (mirrors the frontend classifier from Phase A).

**Bulk unwatch** — DELETE button per row hits existing `unsubscribe.delete.ts` with `?itemId=...&columnId=...`. No bulk endpoint needed for MVP.

## Feature 4 — Auto-watch on participation

**Backend changes**

The `autoSubscribe(userId, boardId, itemId?)` helper in `server/utils/subscriptions.ts` already exists. Wire it into:

| Site | When |
|---|---|
| `server/api/agency/tasks/index.post.ts` (task create) | Subscribe creator at item level |
| `server/api/agency/tasks/[id].put.ts` (assignee change) | Subscribe new assignee at item level |
| `server/utils/notifications.ts:notifyMention` | Subscribe mentioned user at item level |
| Comment endpoints (find via grep) | Subscribe commenter at item level |

**Pre-flight check** — before calling `autoSubscribe`, look up the user's `auto_subscribe_on_participation` preference. If `false`, skip.

```ts
// New helper in subscriptions.ts
export async function autoSubscribeIfEnabled(userId: string, boardId: string, itemId?: string): Promise<void> {
  const row = await queryOne(
    `SELECT auto_subscribe_on_participation FROM team_members WHERE id = $1`,
    [userId]
  )
  if (row?.auto_subscribe_on_participation === false) return
  await autoSubscribe(userId, boardId, itemId)
}
```

**Settings UI** — add toggle in `app/pages/settings/notifications.vue`: "Auto-subscribe to items I create, comment on, am assigned to, or am @mentioned in." Default true. Hits a new `PUT /api/notifications/preferences` field `autoSubscribeOnParticipation`.

## Out of scope (defer to Phase C/E)

- Per-notification snooze
- Slack/Teams routing (dropped — keep in-house)
- AI-driven importance scoring
- Email digest

## Acceptance criteria

- [ ] Migration 078 applied without errors
- [ ] Snooze for 1h via popover suppresses board notifications until expiry; auto-resumes after
- [ ] Item-level Watch button on task panel persists per-item subscription
- [ ] My Subscriptions page lists all of current user's subs grouped by board with unwatch working
- [ ] Creating a task auto-subscribes the creator at item level (verified by visiting task → sees Watching state)
- [ ] User toggling off `auto_subscribe_on_participation` and creating a task does NOT auto-subscribe
- [ ] Existing All/Mentions/Custom/Muted presets continue to work; Phase A reason badges still appear

## Risks

| Risk | Mitigation |
|---|---|
| `getSubscribers` snooze filter breaks tests that don't mock snoozed rows | Existing tests pass `is_muted=false` only; snooze filter defaults to non-snoozed (NULL) which is the same path |
| `BoardWatchSettings` becoming too branchy with itemId support | Keep two hydrate functions, share Save logic via the props.itemId branch |
| Auto-subscribe loops (commenter notifies themselves and re-triggers) | `autoSubscribe` is idempotent (`ON CONFLICT DO NOTHING`); `notifyBoardSubscribers` already filters out actor |
| My Subscriptions page slow if user has 100+ subs | Single query with JOINs; no pagination MVP — revisit if data grows |
