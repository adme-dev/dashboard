# Ad-Spend Budget Alerting — Design Spec

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Author:** Paul + Claude

## Problem

A managing-director escalation (the "Mornington Nissan" email) exposed a gap: a SEM campaign
underspent its budget for months without anyone catching it, despite a daily 9am Budget Tracker
review process. McRae Nissan / McRae LDV showed similar month-end variances. The questions raised:

- What's the current status of pacing across all campaigns?
- How many campaigns have underspends, overspends, or pacing issues right now?
- Why wasn't this escalated before it became client-facing?
- Confirmation the daily 9am review is actually run and posted in Slack.

The platform already syncs per-campaign daily spend (Meta + Google) and has a daily anomaly-detection
cron, but:

1. The existing ad-spend anomaly detector only flags **spikes** (today ≥ 2× the 30-day average). It
   never looks at budget, so **chronic underspend is invisible** to the automated pipeline.
2. There is **no Slack delivery** for budget review — the 9am-in-Slack process is entirely manual.

This spec closes both gaps and adds adjacent delivery-health signals the same data already supports.

## Goals

- Detect sustained underspend (and related delivery failures) automatically in the daily cron.
- Escalate critical budget issues in real time and post a daily 9am budget review to Slack —
  including a positive "all clear" message as proof the process ran.
- Make pacing status self-serve via the AI chat.
- Turn critical escalations into tracked, assigned work (accountability tasks), optionally.

## Non-Goals (YAGNI)

- Full tool/function-calling rewrite of the AI chat (keyword-routing context injection is sufficient).
- SMS delivery (not implemented in the platform) and Slack interactive buttons (require a full Slack
  app rather than an incoming webhook).
- Exposing underspend/pacing in the **client portal** — these are internal signals and must not be
  client-visible.
- Per-tenant threshold tuning UI (thresholds are code constants for now).

## Key facts grounding the design (verified in code)

- **Analyser registry:** `server/utils/anomalyDetection/index.ts` exports `ALL = [...]`; a new analyser
  is added by importing it and appending to that array. `runAllAnalysers` runs them in parallel.
- **Notify hook:** `reconcile.ts` Pass 3 loops `newlyInsertedCriticalIds` and calls
  `queueAnomalyNotification(id)` — fires once, only for newly-inserted **critical** anomalies. This is
  the seam for real-time Slack and accountability-task creation.
- **Anomaly types:** the `anomalies` CHECK constraint already permits `'adspend'` and `'budget'` — so
  new signals need **no migration**. `anomalies.context` is JSONB (used here for the task-link).
- **Cron self-gate:** `server/api/cron/anomaly-detection.post.ts` authenticates via `x-cron-secret`
  against `CRON_SECRET`, resolves the tenant connection's `timezone` (default `Australia/Sydney`), and
  gates to a local hour via `Intl.DateTimeFormat`; `?force=true` bypasses the gate. Replicated at 9am
  for the digest.
- **Config store:** `agency_settings (tenant_id, key, value JSONB)` (migration 095) — the per-tenant
  key/value config store. No new table needed.
- **`media_spend` columns:** `id`, `client_id`, `platform`, `budget_allocated` (DECIMAL, NOT NULL),
  `actual_spend`, `commission_rate`, `period` (`VARCHAR(7)`, `YYYY-MM`), `campaign_status` (TEXT, from
  sync — `PAUSED`/`REMOVED`/etc.), `synced_at` (TIMESTAMPTZ, stamped each sync), `conversions`,
  `clicks`, `impressions`.
- **`daily_spend` columns:** `media_spend_id`, `spend_date` (DATE), `spend`, `impressions`, `clicks`,
  `conversions`.
- **Existing AI daily digest** (`server/utils/aiAgentAnalyzer.ts` → `analyzeAdSpendAnomalies`) already
  reads `anomalies WHERE type='adspend' AND status NOT IN ('resolved','dismissed')`, role-filtered to
  **owner/admin** and **media_buyer**, wrapped in a Groq narrative, delivered in-app + email. New
  anomalies flow into it **for free**.
- **Notification channels** (`server/utils/notifications.ts`): web push + in-app + email (Resend) all
  fire via the existing `anomaly_critical` path. No SMS/Slack channel exists in this util.
- **Existing pacing recommendations:** `server/utils/advisorGenerators.ts` has an "Ad Pacing Generator"
  that writes under/overspend findings to the `recommendations` table. It is advisory-only (no
  escalation/Slack). We align thresholds with it and leave it otherwise untouched.
- **Slack pattern:** `server/utils/leads/destinations/slack.ts` — blocks + `fetch`, validates
  `https://hooks.slack.com/services/...`, 30s timeout. Mirrored (not imported — it is lead-shaped).
- **Companion cron worker:** `workers/pages-cron/src/index.ts` has a `ROUTES` map keyed by cron
  expression; the digest endpoint is added to the existing hourly route. No new Worker.
- **Settings UI:** `app/pages/agency/settings/index.vue` is a tabbed page; a new "Budget Alerts" tab is
  added here.
- **AI chat:** `server/api/ai/chat.post.ts` uses keyword routing into context strings (no tool-calling).
  A `budget|pacing|...` route is added the same way.

## Architecture

### Component 1 — `adspendHealth` analyser

`server/utils/anomalyDetection/analysers/adspendHealth.ts`, added to `ALL`. The existing `adspend.ts`
(spike detector) is unchanged. `sharedData.ts`'s `mediaSpend` query is extended to also select
`ms.id AS media_spend_id`, `ms.budget_allocated`, `ms.period`, `ms.campaign_status`, `ms.synced_at`,
and `ds.conversions` (backward-compatible — the spike analyser ignores extra columns).

The analyser groups rows by `(client_id, platform)`, resolves the current period's `media_spend` row,
and composes six **pure** detector functions. Each detector is exported and unit-tested in isolation.
All emitted anomalies use `type:'adspend'`, distinct tags, and month-level fingerprints
(`{signal}-{mediaSpendId}-{period}`) so re-detection updates one row per campaign per month.

Default thresholds (module constants, shared with the Ad Pacing Generator):

| Detector | Condition | Severity |
|---|---|---|
| `detectUnderspend` (budget-pace) | `budget>0`, day-of-month ≥ 7, `MTD / expectedToDate < 0.50` | warning; **< 0.25 → critical** |
| `detectStopped` (drop-off; only when `budget===0`) | baseline > $5/day over trailing days 4–14, last 3 days < 10% of baseline pace | critical |
| `detectPausedWithBudget` | `campaign_status ∈ {PAUSED,REMOVED,DISABLED,paused,removed}` AND `budget>0`, current period | warning (→ critical if also underspending) |
| `detectOverspend` (pace) | `budget>0`, day ≥ 7, projected month-end `> 1.15 × budget` | warning; **> 1.30 → critical** |
| `detectStaleSync` | `synced_at IS NULL OR < now-48h` (`< now-72h → critical`), `budget>0`; deduped to one per client+platform | warning/critical |
| `detectZeroConversion` | day ≥ 10, `MTD spend > $500`, `MTD conversions === 0` | warning |

where `expectedToDate = budget × dayOfMonth / daysInMonth`, `MTD = Σ daily_spend.spend` in the current
month, and `projectedMonthEnd = MTD × daysInMonth / dayOfMonth`. `dayOfMonth` is computed in the
tenant-local timezone.

`detectUnderspend` (requires `budget>0`) and `detectStopped` (requires `budget===0`) are mutually
exclusive, so a campaign cannot fire both. Only **critical** anomalies reach real-time Slack /
push / email; warnings flow to the daily digest, the AI daily digest, and in-app only.

Each detected anomaly carries: `fingerprint`, `type:'adspend'`, `severity`, `title`, `description`
(human dollar figures — e.g. "spent $312 of an expected $2,750 — **$2,438 behind pace**"), `metric`,
`comparison`, `context` (`{ client, vendor }`), `recommendation`, `tags`, `dataSources:['Daily Spend']`.

### Component 2 — Slack budget review

**Config:** `agency_settings` key `budget_slack`, `value` JSONB:

```jsonc
{
  "webhook_url": "https://hooks.slack.com/services/...",
  "channel": "#budget-tracker",       // optional override
  "digest_enabled": true,
  "realtime_enabled": true,
  "digest_hour": 9,                    // tenant-local hour
  "create_tasks": false,               // accountability tasks (default off)
  "task_assignee_id": null             // UUID or null (unassigned)
}
```

"Active on deploy" semantics: the analyser runs immediately and feeds the existing digest/push/email.
Slack is **silent until a valid `webhook_url` is saved** — that is the natural first-run safety valve,
so no separate feature flag is needed.

**Helper** `server/utils/anomalyDetection/slackBudget.ts` (pure + injectable):

- `validateWebhook(url): boolean` — accepts only `https://hooks.slack.com/services/...` (SSRF guard).
- `buildDigestBlocks(anomalies, { date, dashboardUrl }): SlackBlock[]` — header with date, a summary
  line (`{nCritical} critical · {nWarning} warning across {nClients} clients`), the worst ≤ 10 items,
  and a "View all →" dashboard link. With zero anomalies, returns a single
  "✅ Daily budget review — no pacing issues detected" block (**proof the process ran**).
- `buildCriticalBlocks(anomalies): SlackBlock[]` — one block per anomaly when ≤ 3, else a single
  rollup block ("⚠️ {N} new critical budget issues — see the dashboard / today's digest").
- `postSlack(webhookUrl, blocks, channel?, fetchImpl = fetch): Promise<{ ok: boolean; error?: string }>`
  — 30s AbortController timeout; mirrors the leads adapter.

**Real-time dispatch:** in `reconcile.ts` Pass 3, after the existing `queueAnomalyNotification` loop,
call `dispatchCriticalBudgetSlack(tenantId, newlyInsertedCriticalIds)`. It loads config (returns early
if `!realtime_enabled` or no valid webhook), filters the IDs to `type ∈ {adspend,budget}`, then applies
the **flood-guard** via `buildCriticalBlocks` (rollup when > 3). This is what makes "active on deploy"
safe on the first run.

**Daily digest cron:** `server/api/cron/budget-slack-digest.post.ts` — copies the auth + tenant +
timezone + local-hour gate from `anomaly-detection.post.ts`, gating to `digest_hour` (default 9),
`?force=true` bypass. Returns early if `!digest_enabled` or no webhook. Queries:

```sql
SELECT id, type, severity, title, description, context
FROM anomalies
WHERE tenant_id = $1
  AND type IN ('adspend','budget')
  AND status NOT IN ('resolved','dismissed')
  AND (snoozed_until IS NULL OR snoozed_until < NOW())
ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_detected_at DESC
```

then posts `buildDigestBlocks(...)`. Wired into `workers/pages-cron/src/index.ts` under the hourly
route `'0 * * * *'` (the endpoint self-gates to the digest hour). **No new Worker.**

**Settings UI:** a new `budget-alerts` tab in `app/pages/agency/settings/index.vue`, backed by
`app/components/settings/BudgetAlertsSettings.vue`. Fields: webhook URL, channel, digest toggle,
real-time toggle, digest hour, "create accountability tasks" toggle, task assignee
(`USelectMenu` of team members), and a **"Send test message"** button. The form is built per the
project's mandatory `frontend-design` skill and `UFormField` conventions.

**Settings API** (guarded by `requireRole(event, PERMISSIONS.FINANCE)` / owner):

- `GET /api/agency/settings/budget-slack` — returns the config.
- `PUT /api/agency/settings/budget-slack` — validates (`validateWebhook`) and upserts into
  `agency_settings`.
- `POST /api/agency/settings/budget-slack/test` — posts a sample message to the configured webhook.

### Component 3 — AI chat awareness

In `server/api/ai/chat.post.ts`, add a `budget` route to the `want` keyword map
(`/underspend|overspend|pacing|budget tracker|on track|campaign spend/`). When matched, a pure
`buildBudgetChatContext(anomalies)` helper turns active ad-spend anomalies into a context string
(e.g. "Pacing: 3 underspending — Mornington Nissan SEM $2,438 behind; 1 overspending; 2 stale-sync"),
appended to the existing context results. No tool-calling; matches the current architecture.

### Component 4 — Accountability tasks (optional, default off)

`server/utils/anomalyDetection/createAccountabilityTask.ts`, following the meeting-action-item→task
INSERT pattern. Triggered from the same Pass 3 newly-inserted-critical hook, gated by
`budget_slack.create_tasks`. For each new critical `adspend`/`budget` anomaly:

1. Resolve a default department + default status (same resolution as the meeting bridge).
2. `INSERT INTO tasks (department_id, status_id, title, description, priority, task_type,
   assignee_id, reporter_id, due_date)` — `priority='high'`, `due_date = today + 1 day`,
   `assignee_id = config.task_assignee_id` (nullable), title/description from the anomaly.
3. `INSERT INTO task_activities (...) VALUES (task_id, ..., 'created', 'Auto-created from budget
   anomaly {fingerprint}')`.
4. `UPDATE anomalies SET context = context || jsonb_build_object('task_id', <id>)` — **idempotency**:
   skip creation if `context->>'task_id'` is already set.

A pure `buildTaskPayload(anomaly, config)` helper (returns `{ title, description, priority, dueDate }`)
is unit-tested; the INSERT wrapper is kept thin. Recurring monthly underspend yields a fresh task each
month (desired — renewed accountability), because each month is a new anomaly fingerprint.

### Component 5 — Pacing-generator alignment

The under/overspend threshold constants live in one module imported by both `adspendHealth.ts` and the
Ad Pacing Generator in `advisorGenerators.ts`, so Mornington shows the same figures in the
recommendations UI and the anomaly/Slack surfaces. The generator is otherwise unchanged.

## Data flow

```
spend sync (Meta/Google) ─► media_spend + daily_spend
                                  │
        daily anomaly cron (7am local) ─► runAllAnalysers ─► adspendHealth (6 detectors)
                                  │                                   │
                              reconcile  ◄───────────────────────────┘
                              │   │   │
            (Pass 3, new critical)│   └─► persisted anomalies ─► AI daily digest (in-app+email, Groq)
                  │               │                            ─► /agency/anomalies UI
                  │               │                            ─► AI chat (budget route)
   queueAnomalyNotification       └─► dispatchCriticalBudgetSlack (real-time, flood-guarded)
   (push + in-app + email)        └─► createAccountabilityTask (if create_tasks)
                                  
        budget-slack-digest cron (9am local, via pages-cron) ─► active anomalies ─► Slack digest
                                                                 (or ✅ all-clear)
```

## Testing

TDD; pure units first. Existing anomaly test patterns are followed.

- **Detectors** (`adspendHealth`): each of the six pure detectors — threshold boundaries, day-of-month
  gates, zero/empty baselines, missing budget, mutual exclusivity (underspend vs stopped), stale-sync
  dedup, paused→critical escalation.
- **Slack** (`slackBudget`): `validateWebhook` (accept/reject incl. non-Slack URLs → SSRF), digest
  block builder (incl. the zero-anomaly all-clear), critical block builder (single ≤3 vs rollup >3),
  `postSlack` with an injected fetch (ok / non-200 / network error / timeout).
- **Chat:** `buildBudgetChatContext` — formatting, empty state.
- **Tasks:** `buildTaskPayload` — title/description/priority/due-date derivation; idempotency guard.
- **Config:** validate + serialize/deserialize round-trip.

## Footprint

- **Migrations: none.** Reuses `anomalies` (types `adspend`/`budget`), `agency_settings`, and the
  `anomalies.context` JSONB column.
- **New runtime surface:** one analyser, one Slack helper, one cron endpoint (+ one line in `pages-cron`
  ROUTES), three settings endpoints, one settings component/tab, one chat route, one task helper.
- **No new Cloudflare Worker.**
- **Flags/config:** all in `agency_settings.budget_slack`. Slack silent until a webhook is saved;
  accountability tasks off by default.

## Implementation phases (for the plan)

1. **Analyser + detectors** — `adspendHealth.ts` + `sharedData` extension + shared threshold constants
   + tests. Ships value alone: anomalies appear in the AI daily digest, push, in-app, and the anomalies
   UI immediately.
2. **Slack layer** — `slackBudget.ts`, settings table usage + API + UI tab, digest cron, real-time
   reconcile hook, `pages-cron` route. (Build the settings form via the `frontend-design` skill.)
3. **Chat awareness** — `buildBudgetChatContext` + the `/api/ai/chat.post.ts` route.
4. **Accountability tasks** — `createAccountabilityTask.ts` + reconcile hook + settings toggle.
5. **Marketing-page sync** (required by repo convention) — add "automated pacing detection + Slack
   budget review" to the ad-spend/anomaly feature entry in `app/pages/features/*` and the marketing nav
   if applicable.

## Open risks

- **Graph campaign-status values** vary by platform (Meta vs Google REST). The paused detector matches a
  set of known values case-insensitively; verify the exact strings each sync writes to
  `media_spend.campaign_status` during implementation.
- **`period` alignment:** detectors evaluate the current month's `media_spend` row only; a campaign with
  no current-period row (never synced this month) is covered by stale-sync, not underspend.
- **First-run volume:** mitigated by the real-time flood-guard (rollup > 3) and tasks-off-by-default;
  the digest batches by design.
