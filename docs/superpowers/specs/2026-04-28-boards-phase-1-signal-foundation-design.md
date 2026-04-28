# Boards Phase 1 — Signal Foundation (Design)

**Date:** 2026-04-28
**Roadmap context:** [`2026-04-28-boards-rd-roadmap.md`](./2026-04-28-boards-rd-roadmap.md) — Phase 1 of 5
**Status:** Design — pending user approval before plan
**Owner:** Paul

## Goal

Ship the substrate every "intelligent" Boards feature needs, plus two visible surfaces on top so it's not pure infra:

1. **Triage page** (`/agency/triage`) — agent-curated "what needs you" inbox with three tabs (For You / My Work / Following), built on top of the existing `notifications` table.
2. **Instruments HUD** — collapsible per-board overlay showing throughput, cycle time, WIP, and aging.

Phase 1 unlocks Phase 3 (AI agent) and Phase 5 (predictive risk pills, capacity map view).

## Non-goals

- Replacing the existing `notifications` table or its consumers (bell, slideover, push, email).
- Mutating AI actions (deferred to Phase 3).
- Per-user ML ranking, mute/snooze rules, anomaly detection, AI brief mode.
- Workspace-level aggregate metrics (Phase 5).

## Background

The codebase already has:

- **`notifications`** table (`server/database/schema-xeroflow.sql`) with types `task_assigned | task_mentioned | task_comment | task_status_changed | task_due_soon | task_overdue | board_member_added | brief_*` etc.
- **`NotificationReason`** enum (`server/utils/notifications.ts`): `mentioned | assigned | watching_board | watching_item | direct`.
- Read-state (`is_read`, `read_at`), per-user RBAC (rows are per-recipient), preferences (`inapp_*` keys), email + Web Push fan-out, SSE stream at `/api/notifications/stream`.

We deliberately **do not** build a parallel event log for the triage feed. We add a thin curation layer on top.

For analytics (cycle time, throughput, aging) we need raw events including those that *don't* notify anyone (e.g. status moves on un-watched tasks). For that we add a separate `board_events` table — narrow, append-only, analytics-only.

### Q1 decision — Curator polarity (read-only agent)

The Triage UI defaults to an AI-curated top-N list with reasoning text and 1-click action chips. A "Show all" toggle exposes the deterministic feed (`notifications` table paginated). The agent reads, scores, and decorates — but never mutates. Mutating tools live in Phase 3.

## High-level architecture

```
                       ┌──────────────────────────────────────────┐
                       │   Existing mutation endpoints            │
                       │   (status, comment, mention, etc.)       │
                       └──────────────────────────────────────────┘
                                 │                       │
                  (already writes)│                       │ (new — single helper)
                                 ▼                       ▼
                       ┌──────────────┐         ┌──────────────────┐
                       │ notifications│         │   board_events   │  ← analytics-only
                       │  (existing)  │         │      (new)       │     append-only log
                       └──────────────┘         └──────────────────┘
                                 │                       │
                                 │                       │ nightly Cron
                                 │                       ▼
                                 │              ┌──────────────────┐
                                 │              │board_metrics_daily│  ← rolled-up KPIs
                                 │              └──────────────────┘
                                 │                       │
                       ┌─────────┴───────────┐           │
                       │                     │           │
            (every 30min Cron)        (existing SSE)     │
                       │                     │           │
                       ▼                     │           │
            ┌──────────────────────┐         │           │
            │ notification_curations│        │           │
            │   (top-N per user,   │         │           │
            │    AI reasoning str) │         │           │
            └──────────────────────┘         │           │
                       │                     │           │
                       ▼                     ▼           ▼
            ┌────────────────────────────────────────────────────────┐
            │   /agency/triage page          │ Board page HUD overlay │
            │   • For You  (curations)       │ • cycle time           │
            │   • My Work  (notifications)   │ • throughput           │
            │   • Following (notifications)  │ • WIP / aging          │
            └────────────────────────────────────────────────────────┘
```

## Schema

### New: `board_events`

```sql
CREATE TABLE board_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES team_members(id) ON DELETE SET NULL,
  event_type      VARCHAR(40) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_events_board_time ON board_events (board_id, created_at DESC);
CREATE INDEX idx_board_events_task_time  ON board_events (task_id,  created_at DESC) WHERE task_id IS NOT NULL;
CREATE INDEX idx_board_events_type_time  ON board_events (event_type, created_at DESC);
```

**Event types in v1:** `status_changed`, `task_created`, `task_completed`, `task_deleted`, `assignee_changed`, `due_date_changed`, `comment_added`, `mention_created`, `subitem_completed`, `automation_fired`, `blocker_added`, `blocker_resolved`.

**Retention:** raw rows kept 90 days; daily rollup is permanent. A weekly cleanup job deletes rows older than 90 days.

### New: `notification_curations`

```sql
CREATE TABLE notification_curations (
  user_id          UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  notification_id  UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  rank             SMALLINT NOT NULL,
  score            REAL NOT NULL,
  reasoning        TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX idx_curations_user_rank ON notification_curations (user_id, rank);
```

Replaced wholesale per cron pass per user (DELETE + INSERT in one transaction).

### New: `board_metrics_daily`

```sql
CREATE TABLE board_metrics_daily (
  board_id          UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  throughput        INTEGER NOT NULL DEFAULT 0,   -- items completed that day
  created_count     INTEGER NOT NULL DEFAULT 0,
  wip               INTEGER NOT NULL DEFAULT 0,   -- in-progress at end of day
  avg_cycle_time_h  REAL,                         -- avg hours create → done for completions that day
  oldest_age_days   INTEGER,                      -- oldest open task age at end of day
  PRIMARY KEY (board_id, date)
);
```

### Existing tables — no schema change

- `notifications` (used as-is)
- `notification_preferences` (existing per-user `inapp_*` keys honoured by curation worker the same way as everywhere else)

## Components

| Component | Path | Responsibility |
|---|---|---|
| `emitBoardEvent()` | `server/utils/boardEvents.ts` | Single helper called from any mutation endpoint. Inserts one row into `board_events`. Wrapped in `.catch(logError)` — non-blocking. |
| `scoreNotification()` | `server/utils/triage/scorer.ts` | Pure function: `(notification, userContext) → score`. Heuristic only — no I/O, fully unit-testable. |
| Curation Worker | `workers/triage-curator/` | Cloudflare Cron (30 min). For each active user: load last-24h unread notifications, score, pick top 10, call Workers AI for reasoning text (batched), upsert `notification_curations`. |
| Daily Rollup Worker | `workers/board-metrics/` | Cloudflare Cron (02:00 UTC). Aggregates prior-day `board_events` rows into one `board_metrics_daily` row per board. |
| Triage API | `server/api/agency/triage/*.ts` | `/curated`, `/my-work`, `/following`, `/mark-all-read`. Thin SQL wrappers; RBAC inherits from notifications (rows are per-user). |
| Instruments API | `server/api/agency/boards/[id]/instruments.get.ts` | Returns last-30-days `board_metrics_daily` for one board. |
| Triage page | `app/pages/agency/triage.vue` | 3-tab UI. Subscribes to existing notifications SSE for real-time arrival; falls back to 60-s polling. |
| `TriageItemCard.vue` | `app/components/triage/` | Single item with reasoning text + action chips ("Mark read", "Open", "Snooze 2h"). |
| `BoardInstruments.vue` | `app/components/board/` | Collapsible HUD overlay on board page. Fetches once on mount; sparklines via Unovis. |

## Data flows

### 1. Mutation creates an event

```
POST /api/agency/boards/:id/items/:itemId/status
  → existing handler updates DB + creates notification(s)
  → handler calls emitBoardEvent({ board_id, task_id, actor_id,
                                    event_type: 'status_changed',
                                    payload: { from, to } })
  → INSERT INTO board_events ... (fire-and-forget)
```

### 2. Curation pass (Cron 30 min)

```
For each user with notifications.created_at > now() - 24h:
  1. Take KV lock curation_lock:<userId> (60s TTL); skip if held
  2. SELECT unread notifications for user (last 24h)
  3. score = scoreNotification(notif, userContext)
  4. Take top 10 by score
  5. Call Workers AI in one batched request: "describe each in 1 sentence (≤80 chars)"
  6. Inside transaction:
       DELETE FROM notification_curations WHERE user_id = $1
       INSERT INTO notification_curations ...
  7. Release lock
```

If the Workers AI call fails, store the rows with `reasoning = NULL`. UI renders a deterministic fallback string from notification fields.

### 3. Render — user opens Triage

```
GET /agency/triage
  • For You    → /api/agency/triage/curated
                 SELECT n.*, c.reasoning, c.rank
                 FROM notification_curations c
                 JOIN notifications n ON n.id = c.notification_id
                 WHERE c.user_id = $userId
                 ORDER BY c.rank ASC

                 If MAX(c.generated_at) < now() - 1h: recompute inline before responding.

  • My Work    → /api/agency/triage/my-work
                 notifications WHERE user_id=$userId AND reason IN ('assigned','direct')

  • Following  → /api/agency/triage/following
                 notifications WHERE user_id=$userId AND reason='watching_board'

  Subscribes to existing /api/notifications/stream SSE for live badge updates.
  Falls back to GET /curated?since=<lastSeen> every 60s if SSE drops.
```

### 4. Read-mark

```
User clicks item → existing PATCH /api/notifications/:id/read
  → notifications.is_read = true, read_at = now()
  → curation row stays (still relevant context for "what was suggested today")
```

### 5. Daily rollup (Cron 02:00 UTC)

```
For each board with board_events on the prior day:
  1. throughput      = COUNT(* WHERE event_type='task_completed' AND date=$day)
  2. created_count   = COUNT(* WHERE event_type='task_created' AND date=$day)
  3. wip             = COUNT(tasks WHERE status IN (in-progress statuses) AT end of $day)
  4. avg_cycle_time_h = AVG(completed_at - created_at) for completions on $day
  5. oldest_age_days = MAX(now() - created_at) for open tasks at end of $day
  6. UPSERT INTO board_metrics_daily
```

### 6. HUD render

```
Board page mount → GET /api/agency/boards/:id/instruments
  → SELECT * FROM board_metrics_daily
    WHERE board_id=$1 AND date >= now()-30d
    ORDER BY date
  → render: 4 metric cards + 4 sparklines (Unovis)
```

## Heuristic scoring (initial weights)

Starting weights (tune via click-through telemetry):

| Signal | Weight |
|---|---:|
| Mentioned in comment/spec | 10 |
| Reply on a thread I'm in | 8 |
| Assigned to me | 7 |
| Blocker added on a task I own | 8 |
| Status changed on a task I own | 5 |
| Due in next 24h on a task I own | 6 |
| New task created on a board I follow | 2 |
| Comment on a watched item | 3 |

Decay: each hour since `created_at` subtracts 0.1. Capped at 0 (never negative). Items already read are excluded from curation entirely.

## Backfill

One-time migration when Phase 1 ships:

1. Insert seed `board_events` from existing `tasks.created_at`, `tasks.updated_at`, `task_column_values.updated_at`, comments, mentions — last 30 days only.
2. Run the daily rollup over the last 30 days to seed `board_metrics_daily`.
3. Curation worker runs immediately after backfill on its first scheduled trigger.

Migration is idempotent: each chunk checks for `(board_id, task_id, event_type, created_at)` before inserting.

## Error handling & failure modes

| Failure | Impact | Mitigation |
|---|---|---|
| `emitBoardEvent` insert fails | Lost cycle-time data point | `.catch(logError)`; counted in `boardevents_write_failure` metric. Lossy by design. |
| Curation Worker fails / times out mid-pass | One user's For You tab is stale | Idempotent (DELETE+INSERT in transaction). Inline fallback if `generated_at < now()-1h`. |
| Workers AI decoration fails | Item appears without reasoning | Store with `reasoning = NULL`. UI renders deterministic fallback string. No retry within pass. |
| Daily Rollup fails | One day missing in metrics | Idempotent (DELETE+INSERT for date). `metrics_rollup_health` row tracks last success; alert if >36h. HUD degrades to "no data for [date]". |
| Notifications SSE disconnects | Real-time updates stop | Existing reconnect logic; Triage also polls `/curated?since=` every 60s. |
| Backfill fails partway | Inconsistent `board_events` set | Single transaction with chunked commits (1000 rows). Re-runnable: each chunk checks natural key. |
| Curation references deleted notification | Stale row | `ON DELETE CASCADE` on FK. |
| User has zero notifications | Empty Triage looks broken | First-render empty state explains: *"Nothing needs your attention. Following N boards. Subscribe to more in [boards]."* |
| Cron worker doesn't fire (CF outage) | Curations grow stale | Inline fallback keeps Triage correct. Only For You ordering degrades to recency. |
| Two cron invocations overlap for same user | Double-write | KV lock `curation_lock:<userId>` (60s TTL). Second invocation skips. |
| Notification preference change mid-pass | Curation surfaces opted-out item | Acceptable. Curation lives ≤30min; next pass excludes it. |

### Cross-cutting principles

- **Fail open.** A broken curator must never break `notifications` rendering (My Work / Following tabs read directly).
- **Analytics events are lossy.** Lost `board_events` reduce metric precision; do not corrupt anything. No retry queues.
- **AI is decoration.** Reasoning strings are the only AI dependency; everything else functions without LLM access.

## Testing

| Layer | Coverage |
|---|---|
| Unit | `scoreNotification()` heuristic — 100% branch on all signal types and edge cases. Daily rollup math via synthetic event sequences. |
| Integration | Curation Worker end-to-end with seeded notifications; Workers AI mocked. `emitBoardEvent` write hook on each mutation endpoint. |
| API | Triage endpoints honour RBAC — two test users with disjoint role grants assert isolation. |
| E2E (Playwright) | `test/e2e/triage.spec.ts` — open page, see curated items, click action chip, notification marked read. `test/e2e/board-instruments.spec.ts` — HUD renders, sparklines show seeded metrics. |
| Smoke | Wrangler dry-run of curation worker on preview deploy before promote. |

Coverage target ≥80% on new `server/utils/triage/*` and `workers/triage-curator/`. Existing notifications code untouched.

## Telemetry

Lightweight metrics for the next round of tuning:

- `triage_open` — page open, user_id
- `triage_item_click` — user_id, notification_id, source_tab, source_rank, score, was_curated
- `triage_mark_read` — user_id, notification_id, source_tab, source_rank
- `triage_curation_skipped` — user_id (lock held)
- `triage_curation_duration_ms` — per pass
- `triage_curation_ai_failure` — count
- `boardevents_write_failure` — count
- `metrics_rollup_health.last_success_at`

Used for: tuning heuristic weights, finding noisy event types, detecting cron drift.

## Cost & latency budget

- Curation Worker: top-10 AI decorations × ~50 active users × 48 passes/day ≈ 24k LLM calls/day. On Workers AI Llama-3-8B, near-free. Reserve Groq for Phase 3 higher-stakes summaries.
- Triage `For You` open: target p95 < 200ms. Curated rows are pre-joined, no AI on the read path.
- HUD render: target p95 < 100ms. Single SELECT against indexed `board_metrics_daily`.

## Migration plan (sequence)

1. Migration `078-board-events.sql` — create `board_events` table + indices.
2. Migration `079-notification-curations.sql` — create `notification_curations` table.
3. Migration `080-board-metrics-daily.sql` — create `board_metrics_daily` table.
4. Migration `081-backfill-board-events.sql` — backfill last 30 days (idempotent, chunked).
5. Deploy `emitBoardEvent` helper + wire into mutation endpoints.
6. Deploy Daily Rollup Worker; run once over the last 30 days.
7. Deploy Curation Worker; first pass runs immediately.
8. Deploy Triage page + Instruments HUD components.
9. Deploy Playwright smoke tests.

Each step ships independently; nothing breaks between them.

## Out of scope (Phase 1)

- Mute/snooze rules per user
- Per-user ML ranking (single global heuristic)
- Anomaly detection in HUD
- Mutating actions from the agent
- Workspace-level metrics aggregate (Phase 5)
- Mobile-first redesign (responsive only)
- AI brief / Briefer mode (deferred per Q1)

## Open questions (resolve in implementation, not blocking design)

- Heuristic weight constants — start with proposed numbers; tune via click-through.
- Reasoning string length cap — start at 80 chars; revisit on real outputs.
- HUD default visibility — collapsed; remembered per user via existing `board_views.config`.
- Following tab definition — boards subscribed OR edited in last 14 days.
- Curation pass batch size — single batch initially; split if pass duration > 5 min.

## Acceptance criteria

Phase 1 ships when:

1. `board_events` is being written by all in-scope mutation endpoints and verified for one month with <1% write-failure rate.
2. Triage page is reachable at `/agency/triage`, all three tabs render, RBAC enforced.
3. Curation Worker has run successfully for 7 consecutive days with no missed passes.
4. `board_metrics_daily` rollup has run successfully for 7 consecutive days.
5. Instruments HUD renders on board page with last-30-days sparklines.
6. Playwright smoke suite passes on preview deploy.
7. Backfill migration applied to production with row counts validated.

## Next step

User reviews this doc. After approval, invoke the `superpowers:writing-plans` skill to break this design into an executable implementation plan.
