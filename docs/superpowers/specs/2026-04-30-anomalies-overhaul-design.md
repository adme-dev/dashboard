# Anomalies Overhaul — Design Spec

**Date:** 2026-04-30
**Owner:** Paul (paul@adme.net.au)
**Route under change:** `/anomalies`

## Goal

Turn the `/anomalies` page from a passive, computed-on-load Xero rule dashboard into a workflow-grade incident system: persisted incidents with status workflow, scheduled detection across financial + ad-spend + per-client signals, push notifications on critical events, and per-incident drill-down and grouping.

## In scope

P0 + P1 from the prior review:

- **P0** — persistence + acknowledge/snooze/dismiss/assign workflow, endpoint consolidation, KV caching, ad-spend integration, critical-only push notifications via Smart Watch + email, daily digest section.
- **P1** — YoY revenue comparison, per-client profitability anomalies, transaction-level z-score (migrated from the legacy `/api/ai/anomaly-detection` endpoint), correlation-based grouping, lazy Groq driver narratives.

## Explicit non-goals

- Operational / work-management anomalies (overdue tasks, brief SLA breaches) — deferred.
- Custom mute rules / per-vendor whitelist UI — deferred.
- Multi-currency — AUD remains hardcoded.
- ML-driven dynamic thresholds — rule-based detection stays.
- Adaptive learning from dismissals (false-positive feedback loop) — deferred.

## Architecture

```
                                   ┌─ daily 7am tenant-local cron ──┐
                                   │  (CF Cron hourly + local gate) │
                                   │                                │
        Xero, Meta, Google Ads ──→ │  detection pipeline            │ ──→ anomalies table
                                   │  (consolidated detector)       │           │
                                   │                                │           │
        manual "Run scan" ────────→ └────────────────────────────────┘           │
                                                                                 │
                                                                                 ▼
                                                                ┌──────────────────────────────┐
                                                                │ on first-detection insert    │
                                                                │ if severity = critical:      │
                                                                │   → Smart Watch notification │
                                                                │   → email                    │
                                                                └──────────────────────────────┘
                                                                                 │
        /anomalies page ←─── /api/ai/anomalies (reads from table) ──────────────┘
        action plan slideover ─→ Groq narrative generated lazily, cached on row
```

Key shifts:

- `/api/ai/anomalies` becomes a **read-only** endpoint against the `anomalies` table. The cron and the manual-scan endpoint are the only writers.
- Old `server/api/ai/anomaly-detection.get.ts` is deleted in the same PR; its transaction-level z-score logic moves into a new `transactions` analyser.
- `aiAgentAnalyzer.ts` ad-spend logic is lifted into a new `adspend` analyser that runs in the same pipeline.
- A new incident model: rows are persistent and deduped by fingerprint, with statuses `open` / `acknowledged` / `snoozed` / `resolved` / `dismissed`.

## Data model

Single migration `server/database/migrations/082_anomaly_persistence.sql`. (Migration number assumes 081 is the latest as per CLAUDE.md memory; verify and bump if newer migrations have landed.)

### `anomalies` (incidents)

```sql
CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  tags TEXT[],
  data_sources TEXT[] NOT NULL,

  metric JSONB,
  comparison JSONB,
  context JSONB,

  group_key TEXT,
  driver_narrative TEXT,
  driver_narrative_at TIMESTAMPTZ,

  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,

  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  assignee_id INTEGER REFERENCES users(id),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforces incident model: one active row per fingerprint per tenant.
CREATE UNIQUE INDEX anomalies_active_fingerprint_idx
  ON anomalies (tenant_id, fingerprint)
  WHERE status NOT IN ('resolved', 'dismissed');

CREATE INDEX anomalies_tenant_status_idx ON anomalies (tenant_id, status);
CREATE INDEX anomalies_group_key_idx ON anomalies (group_key) WHERE group_key IS NOT NULL;
CREATE INDEX anomalies_severity_idx ON anomalies (tenant_id, severity, status);

-- Allowed enum values enforced via CHECK; can be loosened to a lookup table later.
ALTER TABLE anomalies ADD CONSTRAINT anomalies_status_check
  CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved', 'dismissed'));
ALTER TABLE anomalies ADD CONSTRAINT anomalies_severity_check
  CHECK (severity IN ('critical', 'warning', 'info'));
ALTER TABLE anomalies ADD CONSTRAINT anomalies_type_check
  CHECK (type IN ('profitability','revenue','expenses','cashflow','receivables',
                  'budget','adspend','clients','transactions'));
```

### `anomaly_events` (audit trail)

```sql
CREATE TABLE anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id UUID NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX anomaly_events_anomaly_id_idx ON anomaly_events (anomaly_id, created_at DESC);

ALTER TABLE anomaly_events ADD CONSTRAINT anomaly_events_event_check
  CHECK (event IN ('detected','re-detected','acknowledged','snoozed','resolved',
                   'dismissed','reopened','assigned','narrative-generated','unsnoozed'));
```

### Other migration steps

```sql
-- Tenant timezone for local-7am cron gating.
-- TODO during planning: verify table name (xero_tenants vs tenants) and add column accordingly.
ALTER TABLE xero_tenants ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Australia/Sydney';

-- New permission for viewing anomalies (gated on the page + endpoints).
-- TODO during planning: confirm exact column names on permissions and role_permissions tables.
INSERT INTO permissions (key, description) VALUES
  ('view_anomalies', 'View and manage anomaly incidents');

INSERT INTO role_permissions (role_id, permission_key)
  SELECT id, 'view_anomalies' FROM roles
  WHERE key IN ('owner', 'admin', 'finance_manager');

-- New notification topic for anomaly subscriptions.
-- TODO during planning: confirm notification_topics schema.
INSERT INTO notification_topics (key, label, description) VALUES
  ('anomalies', 'Anomaly Detection', 'Critical financial and ad-spend anomalies');
```

### Status semantics

| Trigger | Action |
|---|---|
| First detection of a fingerprint (no row, or only `resolved`/`dismissed` rows exist) | INSERT new row with `status='open'`. If `severity='critical'`, queue notification. |
| Re-detection of an active fingerprint | UPDATE `last_detected_at`, refresh metric/context, append `re-detected` event. No notification. |
| Cron run completes; active fingerprint not detected | UPDATE row to `status='resolved'`, set `resolved_at`, append `resolved` event. Applies to `open` and `acknowledged` rows. |
| `snoozed_until < NOW()` and fingerprint still detected | Flip back to `open`, append `unsnoozed` event. |
| `snoozed_until < NOW()` and fingerprint not detected | Flip to `resolved`. |
| Resolved or dismissed row + new detection | INSERT new row. The history of past incidents is preserved. |

Acknowledged anomalies that stop firing **auto-resolve** (PagerDuty/Datadog model). Documented explicitly because someone may expect Sentry-style "stay open until manually resolved".

### Snooze durations

UI offers `24h`, `7 days`, `30 days`, `Custom...` (date+time picker). Stored as absolute timestamp.

## Detection pipeline

New folder `server/utils/anomalyDetection/`:

```
index.ts              -- runDetection(ctx) → DetectedAnomaly[]
runForTenant.ts       -- runDetectionForTenant(tenantId, opts) — public entry, used by cron + manual scan
types.ts              -- DetectedAnomaly, AnalyserContext
fingerprints.ts       -- buildFingerprint(type, subKey)
reconcile.ts          -- diff detected vs. existing rows; insert/update/resolve; queue notifications
sharedData.ts         -- fetch Xero/Meta/Google data once per run, share across analysers
analysers/
  profitability.ts
  revenue.ts          -- prior-period + new YoY
  expenses.ts         -- daily z-score + concentration + share-of-revenue
  cashflow.ts
  receivables.ts
  budget.ts
  adspend.ts          -- NEW (lifted from aiAgentAnalyzer.ts)
  clients.ts          -- NEW (per-client profitability + margin decline + revenue concentration)
  transactions.ts     -- NEW (transaction-level z-score from old anomaly-detection.get.ts)
groupRules.ts         -- post-analyser correlation → group_key assignment
```

### Analyser contract

```ts
interface AnalyserContext {
  tenantId: string
  data: SharedData          // pre-fetched Xero/Meta/Google payloads, shared across analysers
  now: Date
}

interface DetectedAnomaly {
  fingerprint: string
  type: AnomalyType
  severity: Severity
  title: string
  description: string
  metric?: AnomalyMetric
  comparison?: AnomalyMetric & { trend?: 'up' | 'down' }
  context?: { period?, range?, category?, vendor?, client? }
  recommendation?: string
  tags?: string[]
  dataSources: string[]
  groupKey?: string         // assigned by groupRules.ts after analysers run
}

type Analyser = (ctx: AnalyserContext) => Promise<DetectedAnomaly[]>
```

### New analysers

**`revenue.ts` YoY** — adds `revenue-yoy-decline` fingerprint when current month is >15% below same month last year.
- Risk: depends on `/api/xero/reports/pnl` returning ≥13 months. To be verified in planning. If not available, this analyser ships disabled and the planner adds the P&L window expansion as a discrete task.

**`clients.ts` per-client**
- `client-unprofitable:<contact_id>` — revenue minus tracked-time cost (and ad-spend pass-through if computable; fallback definition: revenue minus time cost only) is negative for the period.
- `client-margin-decline:<contact_id>` — margin dropped >20 percentage points vs. prior period.
- `client-revenue-concentration:<contact_id>` — single client >40% of period revenue.
- Risk: agency-specific cost formula needs the rate-card module reviewed during planning.

**`adspend.ts`** — lifted from `server/utils/aiAgentAnalyzer.ts`:
- `adspend-spike:<client>:<platform>` — daily spend > 2× rolling 30-day average.
- `adspend-budget-breach:<client>` — month-to-date > monthly cap from `client_ad_budgets`.
- `adspend-pacing:<client>` — projected month-end > cap by 15% or more.

**`transactions.ts`** — migrated transaction-level z-score from the old endpoint. Per-account 2σ outlier detection. Fingerprint: `transaction-outlier:<account>:<period>`.

### Correlation / grouping (`groupRules.ts`)

Runs after all analysers. Assigns shared `group_key`:

- `low-margin` + `margin-compression` + `revenue-decline` for same period → `incident:profitability:<period>`
- `budget-overspend-warning` + `budget-cat-*` for same period → `incident:budget:<period>`
- `high-burn-rate` + `low-cash-reserves` + `shortfall-projected` for same period → `incident:liquidity:<period>`

No grouping for ad-spend — each spike is a distinct campaign issue.

UI groups cards by `group_key` under a parent summary; each child remains its own row so individual snoozes work.

### Reconciliation (`reconcile.ts`)

Wrapped in a transaction per tenant:

1. Load all active rows (`status NOT IN ('resolved', 'dismissed')`) for the tenant.
2. Build map by fingerprint.
3. For each detected anomaly:
   - Active row exists → UPDATE `last_detected_at`, refresh metric/context, append `re-detected` event.
   - No active row → INSERT, append `detected` event, queue notification if `critical`.
4. Active rows whose fingerprint wasn't detected this run → UPDATE `status='resolved'`, set `resolved_at`, append `resolved` event.
5. Snooze housekeeping: rows with `snoozed_until < NOW()` and fingerprint still active flip to `open` (append `unsnoozed` event); not-still-detected ones go to step 4.

Concurrent-reconcile safety: in-flight lock (below) guarantees no parallel runs for the same tenant. The unique partial index is a backstop.

## Notification flow

Triggered from `reconcile.ts` step 3 when a row is inserted with `severity='critical'` and `status='open'`.

### Channels (reuse existing infra)

**Smart Watch (in-app)** — `server/utils/notifications.ts`
- Insert notification row with `kind='anomaly'`, `entity_type='anomaly'`, `entity_id=<anomaly.id>`, reason `'anomaly_critical'`.
- Routing: subscribers of the new `anomalies` topic (added in migration).
- Activity Hub picks these up automatically via the existing notification feed.

**Email** — Resend
- New template `templates/email/anomaly-alert.html`. Single-incident layout.
- Subject: `[Critical] {{title}}`.
- Body: title, description, metric, recommendation, "Open in dashboard" CTA → `/anomalies?focus=<id>`.
- No Groq narrative in this email (lazy-generation choice). The CTA is the call to action.

**Daily digest**
- Existing daily digest pipeline gains an "Anomalies" section, listing all `open|acknowledged|snoozed` anomalies grouped by severity.
- Groq narrative summarises the top 3 by financial impact (this is the same Groq surface that already powers digest narratives).

### Idempotency

- `notification_sent_at` on the anomaly row is set in the same transaction as the INSERT.
- Re-detection finds the row → no notification.
- Re-occurrence (after `resolved`) is a new INSERT → fresh notification.

### Permissions

- Anomaly notifications go to users with the `view_anomalies` permission.
- Default-grant roles: `owner`, `admin`, `finance_manager`.
- Per-user opt-out via existing kind-based notification preference UI.

### Failure handling

- Smart Watch insert fails → log, retry once, leave `notification_sent_at` null so next reconcile retries (best-effort, not transactional with the anomaly row).
- Resend fails → existing email retry mechanism.
- Anomaly row always persists even if notification fails.

## UI changes

`app/pages/anomalies/index.vue` rewritten against the new persisted endpoint.

### Layout

**Tabs** (top): `Active` (default — `open` + `acknowledged` + `snoozed`) | `History` (`resolved` + `dismissed`).

**Toolbar**:
- **Status pills** scoped to the current tab. Active tab pills: `Open` / `Acknowledged` / `Snoozed`. History tab pills: `Resolved` / `Dismissed`.
- **Severity filter** + **Type filter** as `USelectMenu` (replaces the v3-API `USelect` violation in the current file).
- **Date range picker** (`UCalendar` range). Default last 30 days of `first_detected_at`.
- **"Run scan now"** button. Calls `POST /api/ai/anomalies/scan`. Disabled with spinner + "Scan in progress…" while in-flight.
- **CSV export** button (`GET /api/ai/anomalies/export.csv`) — honours filters.
- All filters persist in URL query (`?status=open&severity=critical&from=...`).

### Card actions (per anomaly)

Footer row of `UButton`s:
- **Acknowledge** → status `acknowledged`, sets `acknowledged_by` / `acknowledged_at`.
- **Snooze ▾** — 24h / 7 days / 30 days / Custom... (`UPopover` with `UCalendar`).
- **Dismiss** → confirmation `UModal` with reason `UTextarea`.
- **Assign ▾** — user picker, writes `assignee_id`.
- **Resolve manually** → `UModal` with `resolution_notes` `UTextarea`.
- **Get AI Action Plan** (existing button; rewired) — triggers lazy Groq generation, caches `driver_narrative` on the row, spinner on first open, instant subsequently.

### Grouped incidents

When >1 active row shares a `group_key`, render a parent `UCard` with summary header (e.g. "Profitability incident — March 2026 · 4 findings") and the children as nested cards. Each child keeps its own action footer and own snooze/dismiss.

### Drill-down links

Add a "View source" link in each card where source data exists:
- `aging-concentration` → `/invoices?aging=90+`
- `vendor-outlier:<vendor>` → `/expenses?vendor=<vendor>&from=...&to=...`
- `client-unprofitable:<id>` → `/clients/<id>/profitability`
- `adspend-spike:<client>:<platform>` → `/agency/social/spend?client=<id>&platform=<platform>`
- `transaction-outlier:<account>:<period>` → `/expenses?account=<account>&from=<period_start>&to=<period_end>`

### Sidebar nav badge

`app/layouts/agency.vue` line 173 — `Anomalies` sidebar item gets a `UBadge` showing count of `status='open' AND severity='critical'` for the current tenant.

Composable `useOpenAnomalyCount.ts` refreshes on:
- Initial mount.
- `visibilitychange` event (tab focus returning).
- Page emits an event after any local status mutation.

No polling.

### Empty / loading / error states

- Loading: `USkeleton` (existing pattern).
- Empty `Active` tab: existing "All clear for now" copy.
- Empty `History`: "No history in this date range".
- Error: existing `UAlert` pattern.

### Marketing copy alignment

`app/pages/features/[slug].vue` anomaly-detection entry:
- "8 specialised analysers" → **9** (profitability, revenue, expenses, cashflow, receivables, budget, ad-spend, clients, transactions).
- "Scoring adapts over time as the system learns" → removed (not true and not in scope).

## Cron and manual scan

### Cron setup

Cloudflare Cron Triggers run UTC-only, so the implementation runs hourly and gates per-tenant on local time.

**`wrangler.toml`**:
```toml
[triggers]
crons = ["0 * * * *"]
```

**`server/api/cron/anomaly-detection.ts`**:
```ts
export default defineEventHandler(async (event) => {
  await requireCronAuth(event)

  const tenants = await queryRows<{ tenant_id: string, timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_tenants WHERE active = true`
  )

  const at7am = tenants.filter(t => {
    const localHour = Number(new Date().toLocaleString('en-US', {
      timeZone: t.timezone, hour: 'numeric', hour12: false
    }))
    return localHour === 7
  })

  const results: any[] = []
  for (const chunk of chunks(at7am, 10)) {
    const settled = await Promise.allSettled(
      chunk.map(t => runDetectionForTenant(t.tenant_id))
    )
    settled.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error('anomaly-cron', { tenant: chunk[i].tenant_id, err: r.reason })
      } else {
        results.push(r.value)
      }
    })
  }
  return { processed: results.length, results }
})
```

Tenant timezone source: Xero org `Timezone` field, seeded into the new `timezone` column on `xero_tenants` via existing tenant-sync. Fallback: `'Australia/Sydney'`.

### Per-tenant detection

**`server/utils/anomalyDetection/runForTenant.ts`**:

```ts
export async function runDetectionForTenant(tenantId: string, opts: { force?: boolean } = {}) {
  const lockKey = `anomaly-scan-lock:${tenantId}`
  const haveLock = await acquireKVLock(lockKey, 300) // 5 min TTL
  if (!haveLock) return { tenantId, status: 'in_flight' }

  try {
    const data = await fetchSharedData(tenantId)
    const detected = await runAllAnalysers({ tenantId, data, now: new Date() })
    applyGroupRules(detected)
    const result = await reconcile(tenantId, detected)
    return { tenantId, status: 'completed', ...result }
  } finally {
    await releaseKVLock(lockKey)
  }
}
```

5-minute lock TTL is well above realistic detection time (~15–60s) but short enough that an aborted/crashed run unlocks itself naturally.

### Manual-scan endpoint

**`server/api/ai/anomalies/scan.post.ts`**:

```ts
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.VIEW_ANOMALIES)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No tenant selected' })

  return runDetectionForTenant(tenantId)
})
```

UI: button is disabled with spinner + "Scan in progress…" while a result with `status: 'in_flight'` is returned; client polls every 5s up to 60s.

### Observability

- Each cron run writes to existing `cron_runs` table with `kind='anomaly-detection'`, tenant, duration, counts.
- New admin endpoint `GET /api/admin/anomalies/cron-runs` reads the last 30 runs.
- Log warning if any single-tenant detection exceeds 60s — migration trigger to CF Queues fan-out if it ever fires regularly.

### Failure modes

| Failure | Behaviour |
|---|---|
| Xero API down | Analyser silently no-ops for that data source; logs warning. Other analysers continue. |
| Meta/Google API down | `adspend.ts` no-ops. |
| Groq down (lazy narrative) | UI shows "narrative unavailable, retry"; anomaly remains actionable. |
| Smart Watch insert fails | Logged; `notification_sent_at` stays null so next reconcile retries. |
| Reconcile transaction fails | Whole tenant's run aborts; partial state never persisted. |
| One tenant errors during cron | Loop continues to next tenant via `Promise.allSettled`. |

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ai/anomalies` | List with filters (status, severity, type, date range, group_key, tab). Reads from table. |
| `GET` | `/api/ai/anomalies/:id` | Single anomaly + event history. |
| `POST` | `/api/ai/anomalies/scan` | Manual scan; respects in-flight lock. |
| `PATCH` | `/api/ai/anomalies/:id` | Status mutation (acknowledge/snooze/dismiss/resolve/assign). |
| `GET` | `/api/ai/anomalies/:id/narrative` | Lazy Groq narrative; caches on row. |
| `GET` | `/api/ai/anomalies/export.csv` | CSV export honouring filters. |
| `GET` | `/api/ai/anomalies/count/critical-open` | Sidebar badge count. |
| `GET` | `/api/admin/anomalies/cron-runs` | Recent cron runs (admin only). |

All endpoints require `view_anomalies` permission via `requireRole(event, PERMISSIONS.VIEW_ANOMALIES)`.

## Phased rollout

Each PR independently shippable.

1. **PR 1 — Foundation.** Migration, persistence layer, reconciliation, manual-scan endpoint, page reads from new table. No cron, no notifications. New analysers stubbed (return empty arrays).
2. **PR 2 — Detection completeness.** Implement `adspend`, `clients`, `transactions`, `revenue` (with YoY) analysers; correlation rules.
3. **PR 3 — Cron + notifications.** Cron handler, backfill script (run-then-enable), Smart Watch integration, email template, daily digest section.
4. **PR 4 — UI polish.** Tabs, status pills, drill-down links, CSV export, sidebar badge, marketing copy alignment.

### Backfill

`scripts/anomaly-backfill.ts` runs detection for every active tenant **with notifications suppressed** (env flag `ANOMALY_NOTIFICATIONS_DISABLED=true` honoured by the reconcile step). Run manually post-PR-3-deploy, before the cron is enabled in the CF dashboard. After backfill, the cron is enabled; only genuinely new incidents notify.

### Endpoint deprecation

- `server/api/ai/anomaly-detection.get.ts` — deleted in PR 2 once `transactions` analyser ships.
- `server/api/ai/anomalies.get.ts` — replaced by the new endpoint surface in PR 1; preserved in git history as backup.

### Backout plan

- Migration is additive (new tables + new column with default + new permission + new topic). No destructive changes to existing tables.
- Disabling the cron in the CF dashboard halts the proactive layer; the page still works against the table's last cron data.
- Worst-case revert: drop the cron, point the page back at the legacy `/api/ai/anomalies` (kept until PR 4 merges).

## Testing strategy

### Unit (`tests/unit/`, Vitest)

- `anomalyDetection/fingerprints.test.ts` — fingerprint stability across types and sub-keys.
- `anomalyDetection/reconcile.test.ts` — full state-machine matrix:
  - new fingerprint → INSERT, notification queued (when critical)
  - re-detection → UPDATE only
  - missing fingerprint → status flips to `resolved`
  - `snoozed_until` expired + still detected → flips to `open`
  - `snoozed_until` expired + not detected → flips to `resolved`
  - resolved row + new detection → new INSERT
  - dismissed row + new detection → new INSERT
  - unique-partial-index race (concurrent inserts) → one wins, other no-ops gracefully
- `anomalyDetection/groupRules.test.ts` — correlation cases produce stable group_keys.
- Per-analyser fixture-driven tests (`profitability.test.ts`, `clients.test.ts`, etc.) using canned Xero / Meta / Google JSON.
- `anomalyNotifications.test.ts` — critical insert triggers Smart Watch + email; warning does not; double-insert (race) only sends one notification.

### Integration (`tests/integration/`)

- End-to-end reconcile against a test database: seed Xero fixtures, run detection, assert row state and event log.
- Manual-scan endpoint: auth + RBAC + in-flight lock semantics.
- Status mutation endpoints: snooze writes `snoozed_until`, dismiss writes event row, resolve writes notes.
- KV lock acquire/release is exercised; lock TTL expiry is asserted.

### Manual UAT (PR 4 checklist)

- Status pills filter correctly within each tab.
- Snoozing a critical anomaly + cron re-run = no re-notification.
- Snooze expires → row moves from "Snoozed" pill to "Open" pill on next page load.
- Resolving an anomaly + re-detection = a new row appears (not an update of the resolved one).
- CSV export honours active filters.
- Sidebar badge updates after dismiss without a page reload.
- Drill-down links land on correctly-filtered destination pages.
- Manual-scan button shows "Scan in progress…" when called twice quickly.

### Post-deploy observability

- `cron_runs` table populated daily.
- Detection durations logged.
- Notification send counts match new-critical insert counts.
- KV in-flight lock acquired and released (no orphans visible in KV).

## Open items resolved during planning

These are deferred from spec → plan:

1. Verify `xero_tenants` (vs. `tenants`) table name and adjust `ALTER TABLE`.
2. Verify `permissions` and `role_permissions` schema (column names) before writing SQL.
3. Verify `notification_topics` schema.
4. Verify `/api/xero/reports/pnl` returns ≥13 months for YoY analyser; expand the window or ship YoY disabled with a follow-up task.
5. Confirm per-client cost formula with rate-card module review; fall back to "revenue minus tracked-time cost only" if pass-through is too tangled.
6. Confirm migration number 082 is the next free slot; bump if newer migrations have landed since this spec was written.

## Risks

- **Notification flood on first deploy** — mitigated by backfill script with notifications suppressed.
- **YoY analyser blocked by data window** — flagged risk; analyser ships disabled if window can't be expanded in scope.
- **Per-client cost formula** — flagged risk; planner consults rate-card module before finalising.
- **Cron handler runtime** — 50 tenants × 15s = ~75s in batched-parallel chunks of 10. Within CF scheduled-handler limits. Migration trigger to CF Queues defined.
- **Lock orphan** — 5 min TTL bounds worst case.
