# GA4 Funnel Integration — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Author:** Paul + Claude

## Summary

Add Google Analytics 4 (GA4) to the platform as its own **website-analytics
domain**, and use it to build a **channel-level funnel** in the client report:

```
Ad spend → Sessions → Key events (GA4 conversions) → Leads (owned ground truth)
```

GA4 is **not** an ad-spend platform. It must **not** be forced into `media_spend`
(which would pollute every `SUM(spend)`/CPC/ROAS aggregation). It gets dedicated
tables and a dedicated report section, joined to existing ad-spend and leads data
**at channel grain** (GA4 Default Channel Group).

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Primary job of GA4 | **Funnel / attribution** — tie GA4 to ad data |
| Attribution grain | **Channel-level** (GA4 `sessionDefaultChannelGroup`); UTM/campaign later |
| Conversion/revenue bottom | **GA4 key events + owned Leads data**, shown side-by-side |
| Storage | **Dedicated `ga4_*` tables**, NOT `media_spend` |
| Connection | Reuse `social_connections` with `platform='ga4'`; **separate** "Connect Google Analytics" button (not bolted onto Google Ads) |

## Existing patterns this builds on

- **OAuth + token storage**: `social_connections` table (migration 008) — columns
  `platform, account_id, access_token, refresh_token, token_expires_at, scopes,
  metadata JSONB, client_id` (client_id added migration 039). One row per account.
- **Google OAuth precedent**: `server/api/agency/social/google/connect.get.ts` +
  `callback.get.ts`; client `server/utils/googleAdsClient.ts` (scope
  `.../auth/adwords`, `access_type: 'offline'`, `prompt: 'consent'`).
- **Token refresh**: 5-minute-buffer refresh pattern in `server/utils/spendSync.ts`
  (`refreshGoogleToken` helper) — reused as-is.
- **Spend storage**: `media_spend` (period `YYYY-MM`, per campaign/client/platform)
  + `daily_spend` (per `media_spend_id` + `spend_date`, upsert on
  `(media_spend_id, spend_date)`).
- **Sync structure**: `spendSync.ts` → load active connections → refresh token →
  fetch per period → upsert. Triggered by `api/cron/*` (header `x-cron-secret`)
  and manual `*/sync-spend.post.ts` (background via `waitUntil`).
- **Leads**: `leads` table (migration 087) — `client_id`, `source`
  (`meta|google|manual|webhook|csv`), `submitted_at`, `status`, `deleted_at`.
- **Portal analytics**: `app/pages/portal/analytics/index.vue` feeds from
  `api/portal/analytics/{overview,trends,campaigns,breakdowns,...}.get.ts`, which
  aggregate `daily_spend`/`media_spend` by `platform`.
- **Migrations**: `NNN-kebab-description.sql`, highest is `120-client-kpi-targets.sql`.
  Next GA4 migration is **`121-ga4-funnel.sql`**.

## Architecture

### 1. Connection & auth

- New rows in `social_connections` with `platform='ga4'`, **one per client GA4
  property**.
- **Separate** connect flow (distinct from Google Ads): a client's GA4 is
  frequently a different Google login than ad management, and we must not force
  re-consent of the working ads connection.
- OAuth scope: `https://www.googleapis.com/auth/analytics.readonly`,
  `access_type: 'offline'`, `prompt: 'consent'` (to guarantee a refresh token).
- New endpoints (mirror the Google Ads ones):
  - `server/api/agency/social/ga4/connect.get.ts` — build OAuth URL with CSRF state.
  - `server/api/agency/social/ga4/callback.get.ts` — exchange code, upsert
    `social_connections` row (no property yet; status `pending_property`).
  - `server/api/agency/social/ga4/properties.get.ts` — list properties via GA4
    Admin API `analyticsadmin.googleapis.com/v1beta/accountSummaries` for the picker.
  - `server/api/agency/social/ga4/map.post.ts` — persist chosen `property_id` +
    display name into `metadata`, set `client_id`, flip status to `active`.
- **Property → client**: `property_id` + `property_display_name` in
  `social_connections.metadata`; `social_connections.client_id` maps the property
  to exactly one client. One property → one client.

### 2. `server/utils/ga4Client.ts`

- `ga4RunReport(propertyId, accessToken, { dimensions, metrics, dateRange })`
  — POST `analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`;
  returns a typed, parsed array of `{ [dim]: string, [metric]: number }` rows.
- `listGa4Properties(accessToken)` — GA4 Admin API `accountSummaries`, flattened to
  `{ accountName, propertyId, propertyDisplayName }[]`.
- Token refresh: reuse `refreshGoogleToken` from `spendSync.ts` (do not duplicate).
- SSRF/safety: only the two fixed Google hostnames are ever fetched; no
  user-supplied URLs.

### 3. Data model — migration `121-ga4-funnel.sql`

Dedicated, daily-grain, channel-segmented. **Not** `media_spend`.

```sql
CREATE TABLE IF NOT EXISTS ga4_daily_channel (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  client_id            UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  property_id          TEXT NOT NULL,
  metric_date          DATE NOT NULL,
  channel_group        TEXT NOT NULL,        -- GA4 sessionDefaultChannelGroup
  sessions             INTEGER     NOT NULL DEFAULT 0,
  total_users          INTEGER     NOT NULL DEFAULT 0,
  new_users            INTEGER     NOT NULL DEFAULT 0,
  engaged_sessions     INTEGER     NOT NULL DEFAULT 0,
  engagement_rate      NUMERIC(8,4) NOT NULL DEFAULT 0,
  avg_session_duration NUMERIC(10,2) NOT NULL DEFAULT 0,
  key_events           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- GA4 conversions
  purchase_revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 0 for lead-gen
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, metric_date, channel_group)
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_client_date
  ON ga4_daily_channel(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_conn_date
  ON ga4_daily_channel(connection_id, metric_date);
```

Top-line site totals roll up via `SUM` over channels — no separate totals table
in v1 (YAGNI).

### 4. `server/utils/ga4Sync.ts`

Mirrors `spendSync`:

1. Load active `platform='ga4'` connections (optionally filtered to one `client_id`).
2. Refresh token if within 5-min expiry buffer; persist new token.
3. `ga4RunReport` with:
   - dimensions: `['date', 'sessionDefaultChannelGroup']`
   - metrics: `['sessions','totalUsers','newUsers','engagedSessions',
     'engagementRate','averageSessionDuration','keyEvents','purchaseRevenue']`
   - dateRange: incremental window = **last 14 days** (GA4 reprocesses ~48h);
     first sync / backfill = last 90 days.
4. Upsert each row into `ga4_daily_channel`
   `ON CONFLICT (connection_id, metric_date, channel_group) DO UPDATE`.

Triggers:
- `server/api/cron/ga4-sync.post.ts` — daily, header `x-cron-secret: $CRON_SECRET`.
- `server/api/agency/social/ga4/sync.post.ts` — manual, background via `waitUntil`.

### 5. The funnel join (channel-level)

New `server/api/portal/analytics/funnel.get.ts` (+ agency twin
`server/api/agency/analytics/funnel.get.ts`). For a client + period, returns one
row per channel:

| Stage | Source | Mapping |
|---|---|---|
| Spend | `media_spend`/`daily_spend` | `platform → channel` |
| Sessions / engaged sessions | `ga4_daily_channel` | direct (`channel_group`) |
| Key events (GA4 conversions) | `ga4_daily_channel` | direct |
| Leads (owned ground truth) | `leads` | `source → channel`, by `submitted_at`/`client_id`, `deleted_at IS NULL` |

**Single channel-mapping function** (source of truth, in a new small
`server/utils/channelMap.ts`, imported by both the funnel endpoints and tests):

```
meta, meta_ads      → 'Paid Social'
google, google_ads  → 'Paid Search'
```

Leads `source` maps the same way (`meta → 'Paid Social'`, `google → 'Paid Search'`;
`manual|webhook|csv → null`/unattributed). GA4 channels not produced by paid
platforms (Organic Search, Direct, Referral, Organic Social, Email, …) carry
sessions/key-events with **zero spend** — that's correct and informative.

Derived per channel: cost/session, cost/key-event, **cost/lead**, session→lead
rate. GA4 key events and owned Leads are shown **side-by-side** for paid channels;
they will not match exactly (on-site signal vs captured ground truth) and the UI
labels them as such.

### 6. Surfacing

- **Client portal**: new **"Website & Funnel"** section in
  `app/pages/portal/analytics/index.vue` — funnel chart (Spend → Sessions → Key
  events → Leads), per-channel table, traffic-by-channel donut (Unovis, per stack).
- **Agency analytics**: same funnel internally for staff review.
- **Graceful degradation**: client with no `ga4` connection → section hidden;
  existing spend report unaffected.
- **Marketing sync** (per `CLAUDE.md`): add the funnel/GA4 feature to
  `app/pages/features/index.vue`, a `[slug].vue` entry, and `MarketingNav.vue`.

### 7. Error handling

- Missing/expired refresh token → mark connection `status='needs_reauth'`, surface
  in connection-health UI, skip sync (don't throw the whole cron).
- GA4 API quota / 429 → log + skip that property this run; next run catches up via
  the 14-day window.
- Property unmapped (`client_id` null) → excluded from client report; visible only
  in agency setup.

### 8. Testing (Vitest)

- `channelMap` function: every platform/source → expected channel; unknowns → null.
- `ga4RunReport` response parser: dimension/metric rows → typed objects, numeric
  coercion, empty-rows case (mocked API responses).
- Funnel aggregation math: spend+sessions+key-events+leads roll-up and derived
  cost ratios for a fixed fixture.

## Scope (YAGNI)

**In (v1):**
- Channel-level daily GA4 metrics (`ga4_daily_channel`).
- Funnel join: spend + sessions + key events + leads, per channel.
- Portal "Website & Funnel" section + agency twin.
- Manual + daily-cron sync, separate GA4 OAuth connect + property picker.

**Out (later):**
- Campaign/UTM-level attribution.
- Top pages / landing pages, geo / device breakdowns.
- GA4 audiences, realtime API.
- Per-lead revenue tying GA4 purchaseRevenue to Xero.

## Open follow-ups (post-v1)

- UTM/campaign-grain attribution once client tagging hygiene is confirmed.
- Decide whether `purchase_revenue` should ever reconcile against Xero invoices.
