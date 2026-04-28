# Phase C — Board Watch Improvements

**Date:** 2026-04-29
**Status:** Approved (design)
**Builds on:** Phase A (reason tagging), Phase B (snooze + auto-watch). All in-house — no external integrations.

## Scope (2 features)

1. **In-app daily digest** — read-only roll-up of today's activity from the existing `notifications` table, grouped by board + reason. Tab in the notifications slideover.
2. **Quiet hours / DND** — user-level time range that suppresses web push (in-app rows still write). Mentions and assignments bypass.

## Migration

`079-quiet-hours.sql`:

```sql
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS quiet_hours JSONB;
```

JSON shape:
```ts
{
  enabled: boolean
  startMinute: number    // minutes-of-day (0..1439), e.g. 20*60 = 1200 for 8pm
  endMinute: number      // same; if endMinute < startMinute, range wraps midnight
  timezone: string       // IANA, e.g. "Australia/Sydney"
  daysOfWeek: number[]   // 0=Sunday … 6=Saturday; default [0,1,2,3,4,5,6]
}
```

NULL means quiet hours not configured (treated as disabled).

## Feature 1 — Daily digest

**Endpoint** — new `GET /api/notifications/digest?range=today|week`

Returns aggregated rollups from `notifications` table, joined with metadata for board names. Computes counts by board + reason, plus the top 3 items (by activity volume) per board.

Response shape:
```ts
{
  range: 'today' | 'week'
  startedAt: string // ISO timestamp marking the start of the range
  totalNotifications: number
  boards: Array<{
    boardId: string
    boardName: string
    counts: {
      mentioned: number
      assigned: number
      watching: number    // watching_board + watching_item collapsed
      direct: number
    }
    topItems: Array<{ taskId: string; taskTitle: string; count: number }>
  }>
}
```

Range definitions:
- `today` — from start of today in user's local TZ (default to Australia/Sydney) up to now
- `week` — last 7 days from now

Aggregation SQL (pseudocode):
```sql
SELECT
  (n.metadata->>'boardId')::uuid AS board_id,
  d.name AS board_name,
  n.reason,
  (n.metadata->>'taskId') AS task_id,
  (n.metadata->>'taskTitle') AS task_title,
  COUNT(*) AS count
FROM notifications n
LEFT JOIN departments d ON (n.metadata->>'boardId')::uuid = d.id
WHERE n.user_id = $1
  AND n.created_at >= $2
  AND n.reason IS NOT NULL
GROUP BY board_id, d.name, n.reason, task_id, task_title
ORDER BY board_id, count DESC
```

Then app code rolls up by board, computes counts per reason bucket, and trims to top 3 items per board.

**UI** — new "Today" tab in `NotificationsSlideover.vue`, sibling to the existing notification list. Toggle within the tab for Today / This week. Each board section is collapsible. Click a row → navigate to that board (or item if specific task).

**No cron**, no new tables. The digest is computed on tab-open. Cache headers (60s) to avoid recompute on rapid switches.

## Feature 2 — Quiet hours / DND

**Backend helper** — new `server/utils/quietHours.ts` exporting `isWithinQuietHours(userId, reason): Promise<boolean>`. Returns true when:
- User has `quiet_hours` set with `enabled: true`
- Current weekday is in `daysOfWeek`
- Current minute-of-day in user's timezone is within `[startMinute, endMinute]` (handling midnight wrap)
- AND `reason !== 'mentioned' && reason !== 'assigned'`

**Integration** — `createNotification()` already has the web push fan-out at top of function. Wrap it:

```ts
const muted = await isWithinQuietHours(params.userId, params.reason)
if (!muted) {
  await sendWebPushToUser(params.userId, { ... })
}
// in-app row insert continues unconditionally
```

**Preferences** — extend `preferences.put.ts` and `preferences.get.ts` to read/write `quiet_hours` JSON.

**UI** — `/settings/notifications` gets a "Quiet Hours" section below the auto-watch switch:
- Master enable switch
- Start time + End time pickers (UInput type=time)
- Timezone (display from browser, store IANA — default `Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'`)
- Day-of-week chips (M T W T F S S; click to toggle)
- Helper text: "During quiet hours we won't ping you with browser notifications. Your inbox still receives everything. @mentions and assignments always come through."

## Acceptance criteria

- [ ] Migration 079 applied
- [ ] Quiet-hours config saves and round-trips through preferences endpoints
- [ ] Web push is suppressed during quiet hours for `reason='watching_*'` and `direct`
- [ ] Web push still fires during quiet hours for `reason='mentioned'` and `reason='assigned'`
- [ ] In-app `notifications` row is created regardless of quiet hours (verified by inbox showing it after the window)
- [ ] "Today" tab in slideover renders aggregated counts grouped by board with top items
- [ ] Tab handles empty state (no notifications today)
- [ ] Tab handles user with no current TZ set (defaults Australia/Sydney)

## Out of scope

- Email digest (deferred — user wants in-house, in-app only for now)
- AI summarisation of digest narrative (Phase E)
- Per-day quiet-hours ranges (one global range for MVP)
- Snooze-by-channel (push-only, in-app DND is via existing snooze)

## Risks

| Risk | Mitigation |
|---|---|
| Digest query slow for power users (>1000 notifications/day) | LIMIT 500 in inner query; warn if hit |
| Timezone math bugs (midnight wrap, DST) | Use `Intl.DateTimeFormat` with `hour12: false` to extract user-local hour:minute server-side; unit-test wrap explicitly |
| User's saved timezone gets stale on travel | Always re-detect from browser on settings page open and overwrite |
| Quiet hours check on every notification adds DB latency | One queryOne per createNotification call; tolerable, can cache per-request later if needed |
