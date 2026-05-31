# Phase 2 — Blended Cross-Channel + Attribution (expanded execution plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline; subagent file-writes are denied in this repo). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Take analytics from per-channel funnel + month-bucketed spend to a canonical-taxonomy, day-accurate, blended cross-channel layer with an auditable rule-based attribution engine and one-click blend presets.

**Architecture:** A `channel_taxonomy` table + `channelTaxonomy.ts` resolver become the single source for native→canonical channel mapping (superseding the hard-coded `channelMap.ts` switch, which is kept as the seed + fallback). The three month-bucketed agency endpoints move to the daily-grain pattern already proven in `funnel.get.ts` (`daily_spend JOIN media_spend WHERE ds.spend_date BETWEEN $start AND $end`). A new `blended.get.ts` reconciles spend (daily) + GA4 (daily) + leads on canonical channel. GA4 sync always re-pulls the trailing 2 days and gains an explicit-range backfill. A pure `attribution.ts` engine implements 5 models over a touchpoint list; `presets.get.ts` exposes named blend definitions.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`server/utils/db.ts`), GA4 Data API (`ga4Client.ts`), Vitest + happy-dom.

---

## Grounded findings (verified against live DB + code, 2026-05-31)

- **Next free migration number is `126`** (`125_spend_sync_jobs.sql` already exists — the handoff's "125" is stale).
- `daily_spend(media_spend_id, spend_date, spend, impressions, clicks, conversions, revenue)` — **100% coverage**: all 424 `media_spend` rows have daily children spanning 2026-02-01→05-31, both platforms. Daily-grain switch drops no campaigns.
- `daily_sum` can trail monthly `actual_spend` slightly (e.g. 920.56 vs 976.30) — daily breakdown lags the authoritative monthly total. Acceptable for windowed reports; documented in code.
- `funnel.get.ts` **already** does daily-grain + canonical channel via `channelMap.ts` + `previousWindow()`. Tasks 2.2/2.3 mirror it; do not reinvent.
- `media_spend.platform` values in use: `meta`, `google_ads`. `leads.source` paid values: `google`, `meta`. GA4 `channel_group` = GA4 default channel grouping (always last-click).
- `leads` has `source, campaign_id, campaign_name, submitted_at, contacted_at, status, client_id, field_data` — **no UTM columns, no per-journey touchpoint stream**. See Task 2.5 decision.
- `computeMetrics/toNum/buildClientCondition/PLATFORM_LABELS` live in `analyticsMetrics.ts`. `buildClientCondition(idx)` references the `ms.` alias.

---

## Task 2.1 — Canonical channel taxonomy

**Files:**
- Create: `server/database/migrations/126-channel-taxonomy.sql`
- Create: `server/utils/channelTaxonomy.ts`
- Create: `test/server/utils/channelTaxonomy.test.ts`

**Migration DDL:**
```sql
-- 126: canonical channel taxonomy (native source value -> canonical channel)
CREATE TABLE IF NOT EXISTS channel_taxonomy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system   TEXT NOT NULL,           -- 'ad_platform' | 'lead_source' | 'ga4'
  native_value    TEXT NOT NULL,           -- e.g. 'google_ads', 'meta', 'Paid Search'
  canonical_channel TEXT NOT NULL,         -- e.g. 'Paid Search', 'Paid Social'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_system, native_value)
);
-- seed from channelMap.ts rules (idempotent)
INSERT INTO channel_taxonomy (source_system, native_value, canonical_channel) VALUES
  ('ad_platform','google_ads','Paid Search'),
  ('ad_platform','google','Paid Search'),
  ('ad_platform','meta','Paid Social'),
  ('ad_platform','meta_ads','Paid Social'),
  ('lead_source','google','Paid Search'),
  ('lead_source','meta','Paid Social'),
  ('ga4','Paid Search','Paid Search'),
  ('ga4','Paid Social','Paid Social'),
  ('ga4','Organic Search','Organic Search'),
  ('ga4','Organic Social','Organic Social'),
  ('ga4','Direct','Direct'),
  ('ga4','Referral','Referral'),
  ('ga4','Email','Email'),
  ('ga4','Display','Display')
ON CONFLICT (source_system, native_value) DO NOTHING;
```

**`channelTaxonomy.ts` shape:**
```ts
export type SourceSystem = 'ad_platform' | 'lead_source' | 'ga4'
// in-memory cache loaded once per worker; resolve(native) -> canonical|null
export async function resolveCanonicalChannel(system: SourceSystem, nativeValue: string): Promise<string | null>
export async function loadTaxonomy(): Promise<Map<string, string>>   // key `${system}|${native}`
export function collectUnmapped(): Array<{ system: SourceSystem; nativeValue: string }>   // values that fell through
```
Falls back to `channelMap.ts` (`adPlatformToChannel`/`leadSourceToChannel`) on cache miss so behaviour never regresses; records misses into the unmapped collector. Cache invalidates lazily (module-scope `Map`, reload helper for tests).

**Steps:** write migration → run via psql → write resolver + tests (seed → resolves known, returns null + records unmapped for unknown, cache hit) → `pnpm exec vitest run test/server/utils/channelTaxonomy.test.ts` → commit `feat(analytics): canonical channel taxonomy table + resolver`.

**Acceptance:** every in-use `media_spend.platform`, `leads.source`, GA4 `channel_group` resolves; unknowns are collectable, not silently 'Other'.

---

## Task 2.2 — Daily-grain accuracy (overview / campaigns / export)

**Files (modify):** `server/api/agency/analytics/overview.get.ts`, `campaigns.get.ts`, `export.get.ts`; `test/server/utils/analyticsDateWindow.test.ts` (new); helper in `analyticsMetrics.ts`.

**Approach:** Replace `ms.period >= $1 AND ms.period <= $2` (params `slice(0,7)`) with a `daily_spend ds JOIN media_spend ms ON ms.id = ds.media_spend_id` source filtered `ds.spend_date BETWEEN $start AND $end` (full ISO dates). Spend/impressions/clicks/conversions/revenue come from `SUM(ds.*)`; campaign metadata (`cost_per_result`, `frequency`, rankings, `end_date`, status, budget) stays from `media_spend` via the existing `array_agg(... ORDER BY ms.synced_at DESC)` snapshots. `buildClientCondition` still applies on `ms.`. Previous-period uses `previousWindow()` from `ga4Funnel.ts` (kills the bespoke month-shift in overview).

Add to `analyticsMetrics.ts`:
```ts
/** Inclusive day window WHERE fragment for daily_spend; caller pushes start,end at the given indices. */
export function dailySpendWindow(startIdx: number, endIdx: number): string {
  return `ds.spend_date BETWEEN $${startIdx} AND $${endIdx}`
}
```

**Test (pure):** a small builder that, given `(startDate,endDate, idx)`, returns the fragment + ordered params; assert "2026-05-08".."2026-05-14" yields a 7-day inclusive window and previous window = 05-01..05-07 (reusing `previousWindow`).

**Steps per endpoint:** rewrite the CTE/source → keep lead LATERAL joins (already date-correct via `submitted_at`) → verify against live DB with a 7-day window vs a whole-month window returning different totals → vitest → commit `fix(analytics): day-accurate date ranges via daily_spend (overview/campaigns/export)`.

**Acceptance:** "last 7 days" returns 7 days; totals differ from month-bucket; campaigns metadata unchanged; export CSV unchanged columns.

---

## Task 2.3 — Blended cross-channel metrics endpoint

**Files:** Create `server/api/agency/analytics/blended.get.ts`, `test/server/utils/blendedMetrics.test.ts`; pure helper in new `server/utils/blendedMetrics.ts`.

**`blendedMetrics.ts` shape:**
```ts
export interface BlendedChannelRow {
  channel: string                 // canonical
  spend: number; leads: number; conversions: number; revenue: number
  sessions: number
  cpl: number | null              // spend / leads (platform-reported leads)
  cpa: number | null              // spend / conversions
  roas: number | null             // revenue / spend
}
export function buildBlended(input: {
  spendByChannel: Record<string, number>
  leadsByChannel: Record<string, number>
  conversionsByChannel: Record<string, number>
  revenueByChannel: Record<string, number>
  sessionsByChannel: Record<string, number>
}): { channels: BlendedChannelRow[]; totals: BlendedChannelRow }
```
Endpoint: RBAC (`requireRole` w/ CLIENTS∪MEDIA_BUYING set, mirroring ga4 endpoints from Phase 1.6), daily-grain spend + conversions/revenue from `daily_spend`, GA4 sessions from `ga4_daily_channel`, leads from `leads`, all bucketed to canonical via `channelTaxonomy` (2.1). Returns `{ channels, totals, comparison }` using `previousWindow`. Label conversion-derived metrics "platform-reported".

**Acceptance:** blended CPL = Σspend/Σleads; per-channel reconciles with funnel for the same window; tests cover null-denominator and multi-channel blend.

---

## Task 2.4 — Trailing-48h re-sync + explicit-range backfill

**Files (modify):** `server/utils/ga4Sync.ts`, `server/api/cron/ga4-sync.post.ts`; `test/server/utils/ga4SyncWindow.test.ts` (new, pure window fn).

**Change:** Extract window computation into a pure exported fn and always include the trailing 2 days:
```ts
export function ga4SyncWindow(opts: { startDate?: string; endDate?: string; lookbackDays?: number; today?: string }): { startDate: string; endDate: string }
// explicit start/end -> used verbatim (backfill); else endDate=today, startDate=today-max(lookbackDays,2)+... ensuring >=2-day trailing re-pull
```
`syncGa4` accepts `{ clientId?, lookbackDays?, startDate?, endDate? }`. Cron stays `lookbackDays: 14` (already re-pulls; the trailing-2 floor guarantees restatement even if someone passes lookbackDays:0). Idempotent via existing `UNIQUE(connection_id, metric_date, channel_group)`.

**Acceptance:** explicit range backfills arbitrary history; default run always overwrites last 2 days; no duplicate rows.

---

## Task 2.5 — Rule-based attribution engine

**Files:** Create `server/utils/attribution.ts`, `test/server/utils/attribution.test.ts`, `server/api/agency/analytics/attribution.get.ts`.

**DATA-GAP DECISION (flag at review):** The `leads` table records a single `source` per lead and there is no per-conversion touchpoint/journey stream or UTM history. True multi-touch attribution has no source data today. We therefore:
1. Build the **auditable engine** as pure functions over an ordered touchpoint list — fully tested, ready for real journey data (Phase 3.1 richer GA4 ingestion / future touchpoint table).
2. Ship `attribution.get.ts` that constructs, per client+window, a touchpoint list from **real** signals available now: GA4 channel sessions (upper-funnel touches, weighted by session volume) + the lead's own `source` as the converting (last) touch. This is explicitly labelled "modelled from aggregate channel data, not per-user journeys."
3. Do **not** fabricate per-user multi-touch paths.

**Engine shape:**
```ts
export type AttributionModel = 'last' | 'first' | 'linear' | 'position' | 'time_decay'
export interface Touchpoint { channel: string; timestamp: number }   // epoch ms, conversion is the last
export function attributeCredit(touches: Touchpoint[], model: AttributionModel, opts?: { halfLifeDays?: number }): Record<string, number>
// returns channel -> credit fraction; SUMS TO 1 per conversion (empty -> {})
```
Models: last=100% last; first=100% first; linear=1/n each; position=40/40 endpoints +20 split middle (single touch=100%, two=50/50); time_decay=2^(-Δdays/halfLife) normalized (default halfLife 7d).

**Endpoint:** RBAC-gated; aggregates credit across the window's leads → channel credit totals; `model` query param (default `position`); returns `{ model, byChannel, note }`.

**Acceptance:** each model's credit sums to ~1 per conversion (tested); single-touch → all models agree (correct, not a bug); endpoint labelled.

---

## Task 2.6 — Data-blending presets

**Files:** Create `server/utils/blendPresets.ts`, `test/server/utils/blendPresets.test.ts`, `server/api/agency/analytics/presets.get.ts`.

**Shape (typed constants, not a table — YAGNI):**
```ts
export interface BlendPreset {
  id: string; label: string; description: string
  metrics: string[]                    // e.g. ['spend','leads','cpl','roas']
  dimension: 'canonical_channel'
  attributionModel: AttributionModel   // from attribution.ts
}
export const BLEND_PRESETS: BlendPreset[]   // 'paid-channel-mix','last-click','blended-roas','organic-vs-paid'
export function getPreset(id: string): BlendPreset | null
```
`presets.get.ts` lists them (RBAC-gated read). Presets reference canonical channels (2.1) + attribution models (2.5).

**Acceptance:** endpoint returns the registry; each preset's `attributionModel` is a valid `AttributionModel`; ids unique.

---

## Phase 2 done when
Date ranges day-accurate; blended metrics reconcile with funnel; GA4 sync self-heals trailing 2 days + backfills; attribution engine tested with models changing credit on multi-touch input (single-touch agreement documented); presets endpoint returns registry. `pnpm exec vitest run test/server/utils` shows no new failures vs baseline. Then **stop for review before Phase 3** (per session scope). Deploy is a separate explicit step.

## Self-review notes
- Spec coverage: 2.1–2.6 map 1:1 to the parent plan's Phase 2 tasks.
- Type consistency: `AttributionModel` defined in 2.5, consumed in 2.6; `BlendedChannelRow` 2.3 only; `Touchpoint` 2.5 only.
- Honesty: 2.5 multi-touch data gap explicitly surfaced rather than faked — review checkpoint item.
- Migration number corrected to 126 (live-verified).
