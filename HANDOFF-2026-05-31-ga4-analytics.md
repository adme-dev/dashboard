# Handoff — GA4 / Enterprise Analytics effort

**Date:** 2026-05-31
**Area:** Analytics + GA4 (agency dashboard + client portal)
**Full plan:** `docs/superpowers/plans/2026-05-31-enterprise-analytics-ga4.md` (3-phase plan; this handoff tracks what's done vs remaining against it).

---

## TL;DR
- **Shipped to production (earlier session):** the `agency_clients` column-drift fixes (migrations 122–123), editable client contact fields, and **Phase 1 of the GA4 plan** (migration 124). All merged to `main`, pushed, deployed. Latest prod deploy: `https://0c77765b.agency-dashboard-6cm.pages.dev`.
- **Shipped to production (this session):** **Phase 2 of the GA4 plan** (migration 126; commits `768312f`→`fdf5ebe`) + the blended UI panel. Prod deploy: `https://67c46d09.agency-dashboard-6cm.pages.dev`. Daily-grain fix + blended panel are now live on `/agency/analytics`; attribution/presets remain API-only. See "Phase 2 — DONE" below. **NOT pushed to `origin`** (needs the `adme-dev` gh account) — `main` is ahead of remote.
- **Not done (the open work):** the GA4 cron trigger, mapping the remaining GA4 properties, UI surfacing of the new Phase 2 endpoints, and all of Phase 3. Details below.

---

## ✅ Completed & deployed this session
1. **agency_clients column drift** (root-caused the original 500s on portal clients/dashboard/access):
   - Migration **122** — `logo_url`; Migration **123** — `contact_email` / `contact_phone` / `address`.
   - Fixed `status`→`is_active` derivation in both dashboards + `aiContextRetriever.ts`; fixed invoices/quotes/pricing/`xeroQuoteWriter.ts` to use real columns. See memory `agency-clients-column-drift.md`.
2. **Editable client contact fields** — `clients/[id].get.ts` + `.put.ts` + `[id].vue` edit slideover "Contact" section + read-only display.
3. **GA4 Phase 1 — quick wins & hardening** (7 commits, migration 124):
   - 1.1 funnel endpoints use `channelMap` single-source (no duplicated CASE) + guard tests (`test/server/utils/ga4Funnel.test.ts`)
   - 1.2 users + engagement metrics surfaced (session-weighted)
   - 1.3 period-over-period delta chips (`previousWindow()` now used; `buildComparison`)
   - 1.4 orphan agency funnel wired into `/agency/analytics` (FunnelChart gained `apiBase`/`clientId` props)
   - 1.5 GA4 sync health persisted (`ga4_sync_status` table) + shown in connect card
   - 1.6 RBAC on GA4 connect/map/sync (`requireRole(CLIENTS ∪ MEDIA_BUYING)`)
   - 1.7 portal analytics date pickers → `UCalendar` convention

---

## ⛔ Remaining work

### A. Operational (no/low code — do these first; they make Phase 1 actually useful)
1. **Enable the GA4 cron trigger** *(handler exists & is `x-cron-secret`-guarded: `server/api/cron/ga4-sync.post.ts`; currently NOT scheduled — GA4 only refreshes on manual "Sync now")*.
   - **Dashboard-only** (Cloudflare Pages rejects `[triggers]` in `wrangler.toml`): CF → `agency-dashboard` → Settings → Triggers → Cron → add `0 * * * *` → POST `/api/cron/ga4-sync` with header `x-cron-secret: $CRON_SECRET`.
   - Low-code follow-up: document `ga4-sync` in the `wrangler.toml` cron-comment block (sits with anomaly-detection/office-assistant/office-retention). *(Trailing-48h re-sync is now built — Phase 2 Task 2.4 — so enabling the cron immediately gets the self-healing window.)*
2. **Map the remaining unmapped GA4 properties** *(87 mapped in `ga4_property_map`; ~6 remain)*.
   - Operator task: `/agency/social` → GA4 connect card → pick client per property. Requires knowing which dealership each property belongs to.
   - Or: provide `property_id → client_id` pairings and map via `POST /api/agency/social/ga4/map` (now RBAC-gated).

### B. Phase 2 — Blended cross-channel + attribution ✅ DONE (committed to `main`, not deployed)
Expanded plan: `docs/superpowers/plans/2026-05-31-phase2-blended-attribution.md`. Migration **126** (`channel_taxonomy`, applied to DB). 6 tasks, one commit each, 43 new unit tests pass; suite baseline 104 failures (`auth`/`cache`/`db`) unchanged.
- 2.1 ✅ Canonical taxonomy — migration 126 `channel_taxonomy` + `server/utils/channelTaxonomy.ts` (table → `channelMap.ts` fallback, unmapped collector, per-worker cache).
- 2.2 ✅ **Daily-grain accuracy** — `overview/campaigns/export.get.ts` now aggregate from `daily_spend` over an inclusive `spend_date` window (1:1 join keeps budget/reach/metadata correct), prev-period via `previousWindow()`. **Live-verified:** a 7-day request used to return the whole month ($57.8k meta), now correct ($13.4k). *This improves the existing `/agency/analytics` page with no UI change.*
- 2.3 ✅ Blended endpoint — `server/api/agency/analytics/blended.get.ts` + `blendedMetrics.ts` (blended CPL/CPA/ROAS per canonical channel; conversions labelled platform-reported). **Currency/timezone normalization deferred** (single AUD tenant today) — re-add when multi-currency lands.
- 2.4 ✅ Trailing-48h re-sync + backfill — `ga4SyncWindow()` floors window at 2 days; `syncGa4`/`social/ga4/sync.post.ts` accept explicit `startDate/endDate`. Cron behaviour unchanged (still `lookbackDays:14`). *This is the Phase-2 half of the §A.1 "trailing-48h" follow-up.*
- 2.5 ✅ Rule-based attribution **engine** — `server/utils/attribution.ts` (last/first/linear/position/time-decay, credit sums to 1) + `attribution.get.ts`. **DATA GAP:** `leads` is single-source (no per-user journey / UTM), so conversions are single-touch today → all models converge (correct). Engine is ready for real multi-touch journeys from Phase 3.1; **no touchpoint table built** and **no UI model selector** (would be a visible no-op now).
- 2.6 ✅ Blend presets — `server/utils/blendPresets.ts` (5 typed presets) + `presets.get.ts`.

**Phase 2 follow-ons (decide before/with Phase 3):**
- **UI surfacing:** ✅ blended panel added to `/agency/analytics` (`app/components/agency/BlendedPanel.client.vue` — tiles + per-canonical-channel table, agency-wide or per client). Still API-only: **attribution** (defer the model selector until multi-touch journey data exists, Phase 3.1) and **presets** (`presets.get.ts` — no picker UI yet).
- **Deploy + push:** committed to `main` only. `pnpm deploy:production`; push needs the `adme-dev` gh account.
- Currency/timezone normalization (2.3) and a real touchpoint table (2.5) are deferred as noted above.

### C. Phase 3 — Deeper GA4 + anomaly + reporting (not started)
- 3.1 Richer GA4 ingestion (`sessionSourceMedium`, `sessionCampaignName`, `deviceCategory`, `landingPage`, `country`, event-level) + `batchRunReports` + quota self-throttle/backoff.
- 3.2 **Wire GA4 into the anomaly engine** (`server/utils/anomalyDetection/`) — currently only spend/invoices/time; GA4 traffic/CVR drops go undetected.
- 3.3 Caching + pre-aggregated rollups.
- 3.4 Scheduled white-label PDF/email reports (R2 + Resend).
- 3.5 Multi-property-per-client rollups (relax `UNIQUE(property_id)` 1:1).
- 3.6 Internal benchmarking (cross-client percentiles).
- 3.7 Warehouse/API export destination + NL insights via existing Groq chat (Supermetrics-inspired).
- **"GA4 → KPIs/widgets" deferred slice** lives here: surface GA4 sessions/engagement/conversions in the dashboard KPI cards + widgets (not just the funnel).

### D. Loose ends / decisions
- **Property→client is strictly 1:1** today — blocks multi-property clients (Phase 3.5).
- **Build-vs-buy** still open: Semrush (SEO/organic — deferred) and Supermetrics (ETL/connector shortcut) — revisit after Phase 2 proves the taxonomy/blending layer.
- **GA4 channel grouping is always last-click** regardless of property attribution setting → never assume GA4 channel == ad-platform channel.

---

## Reference

**Key files**
- Plan: `docs/superpowers/plans/2026-05-31-enterprise-analytics-ga4.md`
- GA4 utils: `server/utils/ga4Client.ts`, `ga4Sync.ts`, `ga4Funnel.ts`, `channelMap.ts`
- Endpoints: `server/api/{portal,agency}/analytics/funnel.get.ts`, `server/api/agency/analytics/{overview,campaigns,export}.get.ts`, `server/api/agency/social/ga4/*`, `server/api/cron/ga4-sync.post.ts`
- UI: `app/pages/portal/analytics/index.vue`, `app/pages/agency/analytics/index.vue`, `app/components/portal/FunnelChart.client.vue`, `app/components/social/Ga4ConnectCard.vue`
- DB model: migration `121-ga4-funnel.sql` (`ga4_property_map`, `ga4_daily_channel`) + `124-ga4-sync-status-and-retention.sql` (`ga4_sync_status`)

**Runbook**
- **Migrations** (run immediately on create): `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`. Next free number: **127** (125 = `spend_sync_jobs`, 126 = `channel-taxonomy`).
- **Deploy:** `pnpm deploy:production` (builds + `wrangler pages deploy`, ~few min; run backgrounded). Build heap handled in the `build` script.
- **Push:** `origin` = `adme-dev/dashboard`; use the **`adme-dev`** gh account (Paul008 → 403). It's the active gh account in this environment.
- **Tests:** `pnpm exec vitest run test/server`. NOTE: 4 suites fail on `main` baseline too (`auth`, `cache`, `db`, `leadsEndpointsList` = 106 failures) — pre-existing/flaky, unrelated. Treat that as the green baseline.
- **GA4 sync (manual):** "Sync now" in the connect card → `POST /api/agency/social/ga4/sync` (90-day lookback); cron handler does 14-day.

**Tracking note:** items here map to the user's "thread #4" (GA4 cron) and the "deferred GA4-into-KPIs/widgets slices" — confirm against that external tracking for any acceptance criteria not captured above.
