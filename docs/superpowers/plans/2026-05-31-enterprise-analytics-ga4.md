# Enterprise Analytics & GA4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the analytics/GA4 endpoints from "ad-spend dashboard + thin GA4 channel funnel" to an enterprise-grade marketing-analytics layer: blended cross-channel metrics, accurate date handling, attribution, deeper GA4 ingestion, anomaly coverage, and scheduled reporting.

**Architecture:** Three sequential phases, each shipping working, testable software on its own. Phase 1 hardens and completes the existing GA4 funnel (no new data sources). Phase 2 introduces a canonical channel taxonomy, blended metrics, daily-grain accuracy, and rule-based attribution. Phase 3 deepens GA4 ingestion, wires GA4 into the existing anomaly engine, adds caching/rollups and scheduled white-label reports. Semrush / SEO is explicitly **out of scope** for this plan (separate future plan).

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>`, Nuxt UI v4), Nitro server routes, Neon Postgres (`server/utils/db.ts`), GA4 Analytics Data API (`server/utils/ga4Client.ts`), Cloudflare Pages/Workers/R2/KV, Resend (email), Vitest + happy-dom.

---

## Scope, sequencing & conventions

**Phase boundaries (each independently shippable):**
- **Phase 1 — GA4 quick wins & hardening.** Ships: agency funnel visible in UI, richer GA4 metrics surfaced, period-over-period deltas, sync health, RBAC, convention fixes.
- **Phase 2 — Blended cross-channel + attribution.** Ships: canonical channel taxonomy, blended CPL/CPA/ROAS, daily-accurate date ranges, trailing-48h re-sync, rule-based attribution toggle.
- **Phase 3 — Deeper GA4 + anomaly + reporting.** Ships: richer GA4 ingestion (source/campaign/device/geo/events), GA4 anomaly analyser, caching/rollups, scheduled white-label reports, multi-property rollups.

**Granularity note:** Phase 1 tasks below are fully specified (exact files, code, SQL, verification) and ready to execute. Phase 2 and Phase 3 are specified at task level (files, schema DDL, acceptance criteria) — **before executing Phase 2 or 3, re-run the `superpowers:writing-plans` skill to expand that phase into fully-coded steps**, because their exact implementation depends on Phase 1/2 outcomes (e.g. the taxonomy table shape). This is intentional, not a placeholder.

**Competitive references & build-vs-buy (informs scope, not a task):**
- The market splits into **pipeline/ETL** tools (Supermetrics, Funnel.io, Improvado — own the *normalized data layer*, 130+ connectors → clean/normalize/blend → push to BigQuery/Snowflake/Redshift/S3/Sheets/BI/API) and **dashboard/reporting** tools (AgencyAnalytics, Whatagraph, Databox — own the *viz + white-label client reports*). We are building the dashboard side on **natively-ingested** data (GA4 + Meta + Google + leads).
- **Key lesson (Supermetrics):** the moat is the **normalized, blended data layer**, not the charts — this is exactly Phase 2. Supermetrics also productizes **data-blending presets** (paid channel mix, last-click attribution, organic social) and offers a **warehouse/API destination** as its enterprise value; both are folded in below (Tasks 2.6 and 3.7).
- **Build-vs-buy:** for channels we don't ingest natively, the Supermetrics API (or Semrush, deferred) could be a *shortcut source* rather than hand-building connectors. Decision deferred; revisit after Phase 2 proves the canonical-taxonomy/blending layer.

**Shared conventions (apply to every task):**
- **Migrations:** numbered kebab-case in `server/database/migrations/`. Next free number is **124** (122 and 123 already exist). Every `CREATE`/`ALTER` uses `IF NOT EXISTS`. Run immediately after writing: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`.
- **Server imports:** `~~/server/utils/...` (double-tilde), never `~/server/utils`.
- **RBAC:** mutations/analytics reads gate with `requireRole(event, PERMISSIONS.X)`; reuse the permission set already used by sibling analytics endpoints (`PERMISSIONS.MEDIA_BUYING` / `PERMISSIONS.CLIENTS`).
- **UI:** Nuxt UI v4 only; dates via `UPopover`+`UCalendar` (never `<UInput type="date">`); wrap fields in `UFormField`.
- **Testing:** add Vitest unit tests for pure functions (`server/utils/*.ts`) under `test/server/utils/`; verify endpoint SQL against the live DB with `psql`; manual UI check for Vue changes. Run `pnpm exec vitest run <file>` per task.
- **Commits:** one commit per task, conventional-commit message, end with the `Co-Authored-By` trailer.
- **Pre-commit:** re-read modified files, check `~/` vs `~~/`, no empty `USelectMenu` values, balanced template tags.

---

## File structure map

**Phase 1**
- Modify: `server/api/portal/analytics/funnel.get.ts` — use `channelMap.ts`, add metrics + prev-window deltas.
- Modify: `server/api/agency/analytics/funnel.get.ts` — same, plus stays the agency twin.
- Modify: `server/utils/ga4Funnel.ts` — extend `FunnelChannelRow` with users/engagement metrics + comparison shape.
- Create: `test/server/utils/ga4Funnel.test.ts` — unit tests for `buildFunnel` + `previousWindow`.
- Modify: `server/utils/channelMap.ts` — (optionally) add a SQL-fragment helper consumed by both endpoints.
- Modify: `app/components/portal/FunnelChart.client.vue` — add `apiBase` prop, render new metrics + deltas.
- Modify: `app/pages/agency/analytics/index.vue` — mount `<PortalFunnelChart :api-base="'/api/agency/analytics/funnel'">`.
- Create: `server/database/migrations/124-ga4-sync-status-and-retention.sql` — sync-status table + retention index/cleanup.
- Modify: `server/utils/ga4Sync.ts` — persist last-sync + error per connection.
- Modify: `server/api/agency/social/ga4/{map.post,sync.post,connect.get}.ts` — add `requireRole`.
- Modify: `app/components/social/Ga4ConnectCard.vue` — show last-sync/health badge.
- Modify: `app/pages/portal/analytics/index.vue` — replace raw date inputs with `UPopover`+`UCalendar`.

**Phase 2** (task-level)
- Create: `server/database/migrations/125-channel-taxonomy.sql`, `server/utils/channelTaxonomy.ts`, `server/utils/attribution.ts`, `server/api/agency/analytics/blended.get.ts`, `server/api/agency/analytics/attribution.get.ts`, `test/server/utils/attribution.test.ts`.
- Modify: `server/api/agency/analytics/{overview,campaigns,export}.get.ts` (month→day grain), `server/api/cron/ga4-sync.post.ts` (+trailing re-sync), `server/utils/analyticsMetrics.ts`.

**Phase 3** (task-level)
- Create: GA4 ingestion tables migration, `server/utils/anomalyDetection/analysers/ga4.ts`, rollup/materialized-view migration, `server/utils/reports/*` + `server/api/cron/scheduled-reports.post.ts`, multi-property migration.
- Modify: `server/utils/ga4Client.ts` (batchRunReports + quota), `server/utils/ga4Sync.ts`, `server/utils/anomalyDetection/sharedData.ts`, `server/database/migrations/121` model (via new migration, not edit).

---

## PHASE 1 — GA4 quick wins & hardening

### Task 1.1: Use `channelMap.ts` in both funnel endpoints (kill duplicated CASE SQL)

**Files:**
- Modify: `server/api/portal/analytics/funnel.get.ts`
- Modify: `server/api/agency/analytics/funnel.get.ts`
- Create: `test/server/utils/ga4Funnel.test.ts`

- [ ] **Step 1: Write failing unit tests for the existing pure helpers** (locks current behaviour before refactor)

```ts
// test/server/utils/ga4Funnel.test.ts
import { describe, it, expect } from 'vitest'
import { buildFunnel, previousWindow } from '~~/server/utils/ga4Funnel'

describe('buildFunnel', () => {
  it('merges spend, ga4 and leads by channel and totals them', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Search': 100, 'Paid Social': 50 },
      ga4ByChannel: { 'Paid Search': { sessions: 200, engagedSessions: 120, keyEvents: 20 } },
      leadsByChannel: { 'Paid Search': 10, 'Organic Search': 4 }
    })
    const ps = out.channels.find(c => c.channel === 'Paid Search')!
    expect(ps.costPerLead).toBe(10)            // 100 / 10
    expect(ps.sessionToLeadRate).toBeCloseTo(0.05)
    expect(out.totals.spend).toBe(150)
    expect(out.totals.leads).toBe(14)
    expect(out.channels.find(c => c.channel === 'Organic Search')!.costPerLead).toBeNull()
  })
})

describe('previousWindow', () => {
  it('returns the equal-length window ending the day before start', () => {
    expect(previousWindow('2026-05-08', '2026-05-14')).toEqual({ prevStart: '2026-05-01', prevEnd: '2026-05-07' })
  })
})
```

- [ ] **Step 2: Run tests — confirm they pass against current code** (these guard the refactor)

Run: `pnpm exec vitest run test/server/utils/ga4Funnel.test.ts`
Expected: PASS (helpers already exist).

- [ ] **Step 3: Refactor `portal/analytics/funnel.get.ts` to build the spend/leads channel maps via `channelMap.ts`**

Replace the inline `CASE WHEN platform IN (...)` channel bucketing with JS mapping after a flat query. Pattern:

```ts
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'
// ...after fetching raw spend rows [{ platform, spend }] and lead rows [{ source, leads }]:
const spendByChannel: Record<string, number> = {}
for (const r of spendRows) {
  const ch = adPlatformToChannel(r.platform); if (!ch) continue
  spendByChannel[ch] = (spendByChannel[ch] || 0) + Number(r.spend || 0)
}
const leadsByChannel: Record<string, number> = {}
for (const r of leadRows) {
  const ch = leadSourceToChannel(r.source) ?? 'Other'
  leadsByChannel[ch] = (leadsByChannel[ch] || 0) + Number(r.leads || 0)
}
```

Keep the GA4 aggregation query as-is (it already returns `channel_group`). Feed all three into `buildFunnel`.

- [ ] **Step 4: Apply the identical refactor to `agency/analytics/funnel.get.ts`** (same code, different auth/clientId source).

- [ ] **Step 5: Verify endpoints still return rows against the live DB**

Run (substitute a real client id):
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT platform, SUM(actual_spend) FROM media_spend GROUP BY platform LIMIT 5"
```
Expected: platforms list resolvable by `adPlatformToChannel`. Re-run the vitest file: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/portal/analytics/funnel.get.ts server/api/agency/analytics/funnel.get.ts test/server/utils/ga4Funnel.test.ts
git commit -m "refactor(ga4): funnel endpoints use channelMap single-source instead of inline CASE"
```

---

### Task 1.2: Surface already-stored GA4 metrics (users, new users, engagement rate, avg session duration)

**Files:**
- Modify: `server/utils/ga4Funnel.ts` (extend row type + aggregation)
- Modify: `server/api/portal/analytics/funnel.get.ts` and `server/api/agency/analytics/funnel.get.ts` (SELECT the extra columns)
- Modify: `app/components/portal/FunnelChart.client.vue` (render them)
- Modify: `test/server/utils/ga4Funnel.test.ts`

- [ ] **Step 1: Extend `Ga4ChannelAgg` and `FunnelChannelRow` in `ga4Funnel.ts`**

```ts
interface Ga4ChannelAgg {
  sessions: number; engagedSessions: number; keyEvents: number
  totalUsers: number; newUsers: number
  engagementRateWeighted: number   // sum(engagement_rate * sessions); divide by sessions for the avg
  durationWeighted: number         // sum(avg_session_duration * sessions)
}
```
Add to `FunnelChannelRow`: `totalUsers: number; newUsers: number; engagementRate: number | null; avgSessionDuration: number | null`. In `buildFunnel`, carry the sums and compute `engagementRate = ratio(engagementRateWeighted, sessions)` and `avgSessionDuration = ratio(durationWeighted, sessions)` per row and for totals.

- [ ] **Step 2: Update the GA4 aggregation SQL in both endpoints** to also return `SUM(total_users)`, `SUM(new_users)`, `SUM(engagement_rate * sessions)`, `SUM(avg_session_duration * sessions)` grouped by `channel_group`, and map into the new `Ga4ChannelAgg` fields.

- [ ] **Step 3: Update the test** to assert `engagementRate`/`avgSessionDuration` are session-weighted averages (add fields to the fixture, assert one computed value).

- [ ] **Step 4: Render in `FunnelChart.client.vue`** — add two tiles (Users, Engagement rate) to the top-line grid (make it `md:grid-cols-3 lg:grid-cols-6`) and add `Sessions/User` or `Engagement %` columns to the table. Format engagement rate as a percentage, duration via a `mm:ss` helper.

- [ ] **Step 5: Run tests + manual check**

Run: `pnpm exec vitest run test/server/utils/ga4Funnel.test.ts` → PASS. Load `/portal/analytics` for a GA4-mapped client; confirm new tiles populate.

- [ ] **Step 6: Commit**

```bash
git add server/utils/ga4Funnel.ts server/api/portal/analytics/funnel.get.ts server/api/agency/analytics/funnel.get.ts app/components/portal/FunnelChart.client.vue test/server/utils/ga4Funnel.test.ts
git commit -m "feat(ga4): surface users + engagement metrics in the funnel"
```

---

### Task 1.3: Period-over-period deltas (use the unused `previousWindow()`)

**Files:**
- Modify: `server/api/portal/analytics/funnel.get.ts`, `server/api/agency/analytics/funnel.get.ts`
- Modify: `server/utils/ga4Funnel.ts` (comparison shape)
- Modify: `app/components/portal/FunnelChart.client.vue`

- [ ] **Step 1: Add a comparison type to `ga4Funnel.ts`**

```ts
export interface FunnelComparison { totals: FunnelChannelRow; deltaPct: Partial<Record<keyof FunnelChannelRow, number | null>> }
export function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null
  return (curr - prev) / prev
}
```

- [ ] **Step 2: In each funnel endpoint**, compute `const { prevStart, prevEnd } = previousWindow(startDate, endDate)`, run the same aggregations for the previous window, build a previous `buildFunnel` totals, and return `{ channels, totals, comparison: { totals: prevTotals, deltaPct: { spend, sessions, keyEvents, leads, costPerLead } }, hasGa4 }`.

- [ ] **Step 3: Update `FunnelResponse` + tiles in `FunnelChart.client.vue`** to show a delta chip (▲/▼ %) under each top-line tile, green/red via semantic colors.

- [ ] **Step 4: Verify** — load the page; confirm deltas render and flip sign correctly across two date ranges.

- [ ] **Step 5: Commit**

```bash
git add server/utils/ga4Funnel.ts server/api/portal/analytics/funnel.get.ts server/api/agency/analytics/funnel.get.ts app/components/portal/FunnelChart.client.vue
git commit -m "feat(ga4): period-over-period deltas on the funnel"
```

---

### Task 1.4: Make `FunnelChart` reusable and wire the orphan agency funnel into the agency analytics page

**Files:**
- Modify: `app/components/portal/FunnelChart.client.vue` (add `apiBase` prop)
- Modify: `app/pages/agency/analytics/index.vue` (mount the component)

- [ ] **Step 1: Add an `apiBase` prop** defaulting to the portal endpoint:

```ts
const props = defineProps<{ startDate: string; endDate: string; apiBase?: string }>()
const endpoint = computed(() => props.apiBase ?? '/api/portal/analytics/funnel')
const { data, pending } = await useFetch<FunnelResponse>(() => endpoint.value, {
  query: { startDate: () => props.startDate, endDate: () => props.endDate },
  watch: [() => props.startDate, () => props.endDate, endpoint]
})
```

- [ ] **Step 2: Mount in `app/pages/agency/analytics/index.vue`** within the existing date-range state:

```vue
<PortalFunnelChart :start-date="startDate" :end-date="endDate" api-base="/api/agency/analytics/funnel" class="mt-6" />
```
(Component auto-imports as `PortalFunnelChart` per the `portal/` folder prefix.)

- [ ] **Step 3: Verify** — open `/agency/analytics`; the Website & Funnel card renders for a GA4-mapped client (and self-hides via `hasGa4` otherwise). Portal page unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/components/portal/FunnelChart.client.vue app/pages/agency/analytics/index.vue
git commit -m "feat(ga4): surface the agency funnel in the agency analytics page"
```

---

### Task 1.5: GA4 sync health — persist last sync + errors and surface them

**Files:**
- Create: `server/database/migrations/124-ga4-sync-status-and-retention.sql`
- Modify: `server/utils/ga4Sync.ts`
- Modify: `app/components/social/Ga4ConnectCard.vue`
- Modify: `server/api/agency/social/ga4/properties.get.ts` (return status alongside connections)

- [ ] **Step 1: Write + run migration 124**

```sql
-- 124: GA4 sync status + retention
ALTER TABLE ga4_daily_channel ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS ga4_sync_status (
  connection_id UUID PRIMARY KEY,
  last_run_at   TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error    TEXT,
  rows_upserted INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_date ON ga4_daily_channel(metric_date);
```
Run with the psql command from conventions; confirm `ALTER`/`CREATE` succeed.

- [ ] **Step 2: In `ga4Sync.ts`**, replace the swallowed error array with an upsert per connection into `ga4_sync_status` (record `last_run_at`, `last_success_at` on success, `last_error` on failure, `rows_upserted`). Keep returning the summary too.

- [ ] **Step 3: `properties.get.ts`** — left-join `ga4_sync_status` per connection; return `{ lastRunAt, lastSuccessAt, lastError }` on each connection object.

- [ ] **Step 4: `Ga4ConnectCard.vue`** — render a status row per connection: green "Synced <relative time>" using `lastSuccessAt`, or red `UBadge` with `lastError` when present.

- [ ] **Step 5: Verify** — click "Sync now"; confirm a `ga4_sync_status` row is written:
```bash
psql "$DATABASE_URL" -c "SELECT connection_id, last_success_at, last_error, rows_upserted FROM ga4_sync_status"
```
Card shows the timestamp.

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/124-ga4-sync-status-and-retention.sql server/utils/ga4Sync.ts server/api/agency/social/ga4/properties.get.ts app/components/social/Ga4ConnectCard.vue
git commit -m "feat(ga4): persist + surface sync health (last sync, errors)"
```

---

### Task 1.6: RBAC on GA4 connect/map/sync endpoints

**Files:**
- Modify: `server/api/agency/social/ga4/connect.get.ts`, `map.post.ts`, `sync.post.ts`

- [ ] **Step 1: Replace bare `requireAuth`** with `requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])` (match the funnel/clients endpoints' permission set). Import `PERMISSIONS` and `requireRole` from `~~/server/utils/...`.

- [ ] **Step 2: Verify** — a viewer/guest token gets 403; a media-buying user succeeds. Confirm no other caller relies on the old bare-auth behaviour (`grep -rn "social/ga4/" app/`).

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/connect.get.ts server/api/agency/social/ga4/map.post.ts server/api/agency/social/ga4/sync.post.ts
git commit -m "fix(ga4): gate connect/map/sync behind RBAC"
```

---

### Task 1.7: Replace raw date inputs on the portal analytics page with the project convention

**Files:**
- Modify: `app/pages/portal/analytics/index.vue`

- [ ] **Step 1: Replace `<UInput type="date">` (lines ~204-216)** with the `UPopover`+`UCalendar` pattern using `@internationalized/date` (`CalendarDate`, `getLocalTimeZone`), mirroring `app/components/workflow/TaskCreateDialog.vue` (canonical `toCalendarDate()` ISO↔CalendarDate helper). Keep the `startDate`/`endDate` ISO strings the rest of the page already binds to.

- [ ] **Step 2: Verify** — date pickers open as calendars, dark-mode styled; changing a date refetches the analytics + funnel.

- [ ] **Step 3: Commit**

```bash
git add app/pages/portal/analytics/index.vue
git commit -m "fix(portal): use UCalendar date pickers on analytics page per convention"
```

**Phase 1 done when:** agency funnel visible, GA4 user/engagement metrics + deltas shown, sync health surfaced, RBAC enforced, date pickers compliant, `pnpm exec vitest run test/server` shows no new failures.

---

## PHASE 2 — Blended cross-channel + attribution

> Before executing, re-run `superpowers:writing-plans` to expand these into fully-coded steps.

### Task 2.1: Canonical channel taxonomy
- Create `server/database/migrations/125-channel-taxonomy.sql`: a `channel_taxonomy` mapping table (`source_system`, `native_value`, `canonical_channel`) seeded from the current `channelMap.ts` rules, plus columns on the GA4 fact to store **both** GA4's last-click channel and the platform-reported channel (they are not equivalent — GA4 channel grouping is always last-click).
- Create `server/utils/channelTaxonomy.ts` to resolve native→canonical from the table (replacing the hard-coded switch), with an in-memory cache.
- **Acceptance:** every `media_spend.platform`, `leads.source`, and GA4 `channel_group` resolves to a canonical channel; unmapped values surface in an "unmapped" report rather than silently bucketing to "Other".

### Task 2.2: Daily-grain accuracy (fix month-bucket date ranges)
- Modify `server/api/agency/analytics/{overview,campaigns,export}.get.ts` and `server/utils/analyticsMetrics.ts` to aggregate from daily spend (`daily_spend`) instead of month-bucketed `media_spend.period` (YYYY-MM).
- **Acceptance:** "last 7 days" returns exactly 7 days of data; add a vitest covering the date-window SQL builder; period-over-period uses `previousWindow()`.

### Task 2.3: Blended cross-channel metrics endpoint
- Create `server/api/agency/analytics/blended.get.ts` returning blended CPL/CPA/ROAS across Meta+Google+GA4 keyed on canonical channel, with currency + timezone normalization fields (store native + normalized; convert at a defined FX-as-of date; bucket days in a canonical per-client timezone).
- **Acceptance:** blended CPL = total spend ÷ total leads across channels; values reconcile with per-channel funnel; documented "platform-reported" labels on conversion metrics.

### Task 2.4: Trailing-48h re-sync + incremental sync + backfill
- Modify `server/api/cron/ga4-sync.post.ts` + `server/utils/ga4Sync.ts`: always overwrite the trailing 2 days every run (GA4 restates recent data); incremental delta for older days; add a backfill entrypoint accepting an arbitrary date range (e.g. a `lookbackDays` already exists — extend to explicit `startDate/endDate`).
- **Acceptance:** re-running the cron updates the last 2 days' rows; a backfill of N months populates history; idempotent (no duplicate rows — relies on the existing `UNIQUE(connection_id, metric_date, channel_group)`).

### Task 2.5: Rule-based attribution toggle
- Create `server/utils/attribution.ts` implementing last-click, first-click, linear, position-based (40/20/40), time-decay over an ordered touchpoint list; `test/server/utils/attribution.test.ts` with fixtures per model.
- Create a touchpoint source (derive from `leads` source + ad-platform + GA4 channel; one row per touch with `client_id, conversion_id, timestamp, channel`); `server/api/agency/analytics/attribution.get.ts`; a UI model selector (default position-based) feeding the funnel/blended views.
- **Acceptance:** switching model re-weights channel credit; last-click matches GA4 reconciliation; each model's credit sums to 100% per conversion; models labelled as rule-based/auditable.

### Task 2.6: Data-blending presets (Supermetrics-inspired)
- Create reusable, named blend definitions over the canonical fact (e.g. "Paid channel mix", "Last-click attribution", "Blended ROAS", "Organic vs paid") that the funnel/blended endpoints and the report builder can deploy in one click, instead of bespoke per-view SQL.
- Store preset definitions (metric set + dimension + canonical-channel grouping + attribution model) as config (table or typed constants); expose a `presets.get.ts` listing them.
- **Acceptance:** selecting a preset on the dashboard renders the corresponding blend without custom query work; presets reuse the Task 2.1 taxonomy + Task 2.5 attribution.

**Phase 2 done when:** date ranges are day-accurate, blended metrics reconcile, recent data self-heals on sync, an attribution model toggle changes channel credit with tests passing, and blend presets render one-click.

---

## PHASE 3 — Deeper GA4 + anomaly + reporting

> Before executing, re-run `superpowers:writing-plans` to expand these into fully-coded steps.

### Task 3.1: Richer GA4 ingestion (more dimensions + batching + quota safety)
- New migration adding GA4 fact tables keyed by additional dimensions: `sessionSourceMedium`, `sessionCampaignName`, `deviceCategory`, `landingPage`, `country`, plus an event-level conversion table (per `eventName`).
- Modify `server/utils/ga4Client.ts` to use `batchRunReports` (≤5 reports/call), send `returnPropertyQuota: true`, persist `PropertyQuota` and self-throttle (defer when in orange/red band), add exponential backoff + jitter on 429/5xx, handle pagination (`offset` loop) and `keepEmptyRows`.
- **Acceptance:** campaign-grain spend↔GA4 join becomes possible; device/geo/landing-page breakdowns available; a 429 backs off rather than failing the property; quota usage logged.

### Task 3.2: Wire GA4 into the anomaly engine
- Create `server/utils/anomalyDetection/analysers/ga4.ts` (traffic-drop, conversion-rate collapse, channel-mix shift) and register it in `server/utils/anomalyDetection/sharedData.ts` + the runner.
- **Acceptance:** a simulated sessions/CVR drop produces an anomaly row of a new GA4 type; respects the existing `ANOMALY_NOTIFY_ALLOWLIST`/suppression runbook.

### Task 3.3: Caching + pre-aggregated rollups
- Add rollup tables / materialized views for the heavy `overview`/`campaigns` aggregations; refresh on cron; hot per-client dashboard payloads cached in Cloudflare KV (`CACHE` binding) with a freshness badge + "provisional (last 48h)" flag.
- **Acceptance:** analytics endpoints read from rollups; p95 latency drops; cache invalidates on sync.

### Task 3.4: Scheduled white-label PDF/email reports
- Create `server/utils/reports/*` (compose per-client report payload), render to PDF (Cloudflare Browser Rendering or an HTML→PDF path), archive in R2, email via Resend; `server/api/cron/scheduled-reports.post.ts` + a schedule config table + an agency UI to configure cadence/branding/recipients.
- **Acceptance:** a scheduled client report generates, lands in R2, and emails with agency branding; manual "send now" works.

### Task 3.5: Multi-property-per-client rollups
- New migration relaxing the `UNIQUE(property_id)` 1:1 model to allow client→many properties (mapping keeps `property_id` unique but `client_id` non-unique; funnel aggregations SUM across a client's properties).
- **Acceptance:** a client with two GA4 properties shows combined sessions/conversions; agency-wide rollup view aggregates across clients.

### Task 3.6: Benchmarking (internal percentiles)
- Add cross-client percentile benchmarking for GA4 engagement/CVR and blended CPL/CPA; surface "vs portfolio median" on the dashboards (extend the existing `benchmarks.get.ts`, creating `platform_benchmarks`/`ga4_benchmarks` tables as needed).
- **Acceptance:** each client KPI shows its percentile vs the portfolio for the period.

### Task 3.7: Warehouse/API export destination + NL insights (Supermetrics-inspired, enterprise tier)
- Expose the canonical blended fact as an **export destination**: a read API (token-auth) and/or scheduled push to a client's warehouse (BigQuery/Snowflake/S3) — the Supermetrics/Funnel enterprise value prop, but on data we already own.
- **NL insights:** point the existing Groq AI chat (`server/utils/aiChatEngine.ts`) at the analytics layer so staff/clients can ask natural-language questions ("which channel had the best CPL last month?") against the canonical fact — mirrors Supermetrics' Claude integration, reusing infrastructure we already have.
- **Acceptance:** an authorized client can pull their normalized daily fact via API/scheduled export; the AI chat answers a metric question grounded in the analytics tables with correct numbers.

**Phase 3 done when:** GA4 ingestion is multi-dimensional and quota-safe, GA4 anomalies fire, dashboards read cached rollups, scheduled reports deliver, multi-property clients roll up, benchmarks render, and the warehouse/API export + NL insights work.

---

## Self-review notes
- **Spec coverage:** every gap from the audit maps to a task — quick wins → Phase 1 (1.1–1.7); blended/attribution/daily-grain/re-sync/blend-presets → Phase 2 (2.1–2.6); richer ingestion, GA4-anomaly, caching/rollups, scheduled reports, multi-property, benchmarking, warehouse-export + NL insights → Phase 3 (3.1–3.7). Supermetrics learnings folded into 2.6 + 3.7 and the build-vs-buy note. Semrush intentionally excluded (deferred).
- **Type consistency:** `FunnelChannelRow`/`Ga4ChannelAgg`/`FunnelComparison`/`FunnelResponse` are defined in Task 1.2/1.3 and consumed consistently in the endpoints and `FunnelChart.client.vue`; `previousWindow`/`buildFunnel`/`pctDelta` signatures match their definitions in `ga4Funnel.ts`.
- **Placeholders:** Phase 1 steps contain concrete code/SQL/commands. Phase 2–3 are deliberately task-level with schema + acceptance criteria and an explicit instruction to expand each via `writing-plans` before execution (their code depends on earlier-phase outputs).
