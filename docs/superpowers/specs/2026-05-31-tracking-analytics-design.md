# Per-Client Tracking Analytics — Design

> **Slice:** the consumption/visualisation layer over Slice 1's `tracking_events`.
> **Builds on:** Slice 1 (merged, `db845c0`). Independent of the conversion-fan-out / raw-PII / persona slices.
> **Supersedes the scope note** `2026-05-31-tracking-slice-2-per-client-analytics-scope.md` with locked decisions.

## Goal
Give agency staff a per-client view of what a client's website audience is doing — traffic, top pages, acquisition, engagement, call/lead intent, and a basic funnel — over a date range, so they can report to clients and optimise spend.

## Locked decisions
| Decision | Choice |
|---|---|
| Scope | **Full view** — KPIs + traffic-over-time + top pages + acquisition + device/browser + intent signals + funnel |
| Surfaces | **Both** — a drill-down at `/agency/tracking/[clientId]` and a "Website" tab on `/agency/clients/[id]`, sharing one container component |
| Timezone | **Per-client** — `agency_clients.reporting_timezone`, default `Australia/Brisbane` |
| Aggregation | **On-the-fly SQL** over `tracking_events` (existing indexes); revisit rollups only if slow |

## Architecture — build once, render twice
One container component `ClientTrackingAnalytics` owns the date range, all panels, and data fetching. Both surfaces render it with a `clientId` prop. (Rejected: separate UIs per surface — guaranteed drift.)

```
/agency/tracking/[clientId].vue ─┐
                                  ├─► <ClientTrackingAnalytics :client-id /> ─► analytics/* panels ─► /api/agency/tracking/analytics/[clientId]/*
client page "Website" tab ───────┘
```

## Data model (migration 126)
- `ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS reporting_timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane';`
- No other schema changes. Day bucketing: `(e.received_at AT TIME ZONE 'UTC' AT TIME ZONE <client_tz>)::date`. Queries use `idx_tracking_events_client_time (client_id, received_at DESC)` and `idx_tracking_events_session`.

## Access control (fixes the Slice-1 IDOR)
`server/utils/tracking/analytics-access.ts` → `requireClientTrackingAccess(event, clientId)`, called first by every analytics endpoint:
- `requireAuth` + base role gate (`owner/admin/lead/project_manager/media_buyer/account_manager`).
- **Per-client row scope via `client_team_assignments`** (migration 064: `client_id` ↔ `team_member_id`): **management roles** (`owner/admin/lead/project_manager`) see **all** clients; **scoped roles** (`media_buyer/account_manager`) only clients they're assigned to — else 403.
- There is no existing reusable cross-client access helper (the leads system uses `client_team_assignments` only for auto-assignment, not read-gating), so this helper is **new** and becomes the canonical agency per-client access check. **Planning must confirm the `user.id` → `team_members.id` mapping** (how an authenticated agency user resolves to a `team_member_id`) before wiring the assignment lookup.

## API (Nitro) — `server/api/agency/tracking/analytics/[clientId]/`
All resolve the client's `reporting_timezone` server-side and accept `from`/`to` (ISO dates; default last 30 days). All return typed JSON; empty data → zeroed/empty payloads, never throw.
- `summary.get.ts` — KPI aggregates: unique visitors (`COUNT(DISTINCT anon_id)`), sessions (`COUNT(DISTINCT session_id)`), page views, total events, avg engagement seconds, % sessions scrolled ≥75, phone_click count, form_submit count.
- `timeseries.get.ts` — per-day buckets in client TZ (visitors + events).
- `breakdown.get.ts` — `?dimension=source|medium|campaign|page|referrer|event_name|device|paid_organic`, returns ranked `{ key, count }[]` (top N + "other").
- `funnel.get.ts` — counts for page_view → engagement → form_submit (+ step conversion rates).

## Pure, TDD-tested helpers — `server/utils/tracking/analytics-sql.ts`
- `dayBucketExpr(tzParamIndex)` → the `AT TIME ZONE` SQL fragment.
- `classifyPaidOrganic(row)` → `'paid' | 'organic' | 'direct'` from click-id/utm presence.
- `classifyUserAgent(ua)` → `{ device: 'mobile'|'tablet'|'desktop', browser: string }` (regex, no heavy lib).
- `NOISE_FILTER` → default exclusions (`dead_click`, obvious bot UAs). All pure → unit-tested.

## Frontend — `app/components/tracking/analytics/`
- `ClientTrackingAnalytics.vue` — container: date range + fetches + lays out panels.
- `AnalyticsDateRange.vue` — `UPopover` + `UCalendar` (project convention), presets 7/30/90/custom.
- `AnalyticsKpis.vue` — KPI cards.
- `AnalyticsTrafficChart.client.vue` — Unovis line/area over time.
- `AnalyticsBreakdownTable.vue` — generic ranked table, reused for pages/sources/devices/referrers.
- `AnalyticsIntent.vue` — call clicks / form submits callouts.
- `AnalyticsFunnel.vue` — 3-step funnel.
- Surfaces: `app/pages/agency/tracking/[clientId].vue` (drill-down; rows in the Site Tracking list become clickable) + a "Website" tab on `app/pages/agency/clients/[id].vue`.
- Client edit form: add a reporting-timezone `USelectMenu` (curated TZ list).

## Error handling & edge cases
- Invalid/missing date range → default last 30 days; `from > to` → 400.
- No events → empty states in every panel (no spinners-forever, no crashes).
- Unknown client / no access → 404/403 via the access helper.
- Large ranges → cap server-side (e.g. max 366 days) to bound query cost.

## Testing
- **Unit (vitest):** `analytics-sql.ts` helpers (day-bucket fragment shape, paid/organic classifier, UA classifier, noise filter).
- **Integration:** a `tsx --tsconfig .nuxt/tsconfig.server.json` proof that seeds events for a throwaway client across a date range and asserts each endpoint's aggregates against real Neon (Slice 1 established this pattern; the local dev server EMFILE-crashes here, so HTTP-through-Nitro is verified post-deploy).
- **UI:** manual (charts/tables render, date range drives refetch, both surfaces show identical data).

## Out of scope
Cross-platform identity stitching, personas/360, ad-platform conversion fan-out, raw-PII hashing, real-time dashboards, daily rollup tables (revisit only if on-the-fly is slow).

## Risks
- **Scale** — `tracking_events` grows fast; on-the-fly aggregation is fine at low/medium volume. Log the row-count/latency threshold at which to add `tracking_events_daily` rollups.
- **Bot/noise** — default filter excludes `dead_click` + known bot UAs; revisit if counts look inflated.
- **Session semantics** — sessions are tag-defined (`session_id`, 30-min idle), not server-recomputed; document on the page.
- **Per-client TZ UI** — adds a field to the client edit form; default keeps existing clients correct (AU) with no backfill.
