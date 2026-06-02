# GA4 Phase-3 UI — Design Spec

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)
**Scope:** Frontend UI only — wire four already-built, RBAC-gated GA4 Phase-3 APIs into the agency analytics surface. No backend changes, no database migrations.

## Background

GA4 enterprise analytics (Phases 1–3) shipped to production. Five Phase-3 features were left "API-only / no UI". Attribution-model selector is **deferred** here (its backend is a single-touch placeholder pending Phase 3.1 richer ingestion — surfacing a model selector would over-promise multi-touch attribution that does not exist yet). The remaining four are built out in this spec:

1. **Ask box** — natural-language query over GA4/blended data (`POST /api/agency/analytics/ask`)
2. **Internal benchmarks** — a client's standing vs the portfolio (`GET /api/agency/analytics/internal-benchmarks`)
3. **Presets** — named blend presets for the blended-channel view (`GET /api/agency/analytics/presets`)
4. **Export-token manager** — mint/list/revoke tokens for the data-export API (`GET/POST/DELETE /api/agency/analytics/export-tokens[...]`)

All four endpoints exist, are RBAC-gated, and are currently called by nothing in `app/`.

## Existing surface (what we build on)

- `app/pages/agency/analytics/index.vue` — the analytics overview. Renders: filter bar (`AnalyticsFilterBar`: date range, client lookup, platform multi-select) → KPI cards → platform table → client table → trend chart → **Blended panel** (`AgencyBlendedPanel` / `app/components/agency/BlendedPanel.client.vue`, line ~226).
- `app/pages/agency/analytics/reports.vue` — scheduled-reports management (separate route, unchanged by this work).
- `app/pages/agency/analytics/client/[id].vue` — single-client drill-down.
- `BlendedPanel.client.vue` — calls `/api/agency/analytics/blended`, shows a 9-metric channel table (spend, leads, cpl, conversions, cpa, revenue, roas, sessions). No metric-column selection today.
- `app/pages/settings/integrations/` — existing integrations settings directory (home for the export-token manager).

## Page structure change

Introduce `UTabs` into `index.vue` with the **shared filter bar rendered above the tabs**, so both tabs inherit filter state (date range, client, platform) with no duplication or cross-route state loss:

- **Overview tab** — the current overview content **plus** the Ask box as a slim bar at the top of the tab body.
- **Insights tab** — the Benchmarks panel.

`reports.vue` remains a distinct route. The Blended panel stays inside the Overview tab (it already lives in `index.vue`).

Filter state lives in `index.vue` (as it does today) and is passed as props into both tab bodies and the new components. No new global state store.

---

## Feature 1 — Ask box

**Component:** `app/components/agency/AnalyticsAskBox.client.vue` (`.client` — interactive, no SSR value).
**Placement:** top of the Overview tab body.
**Behavior:** one-shot, stateless (matches the API). No conversation history.

- Props: `startDate`, `endDate`, `clientId?` (from the shared filter bar — the box **inherits page filters**).
- A `UInput` (or `UTextarea` for longer questions) + submit `UButton`. Enter submits.
- On submit: `$fetch('/api/agency/analytics/ask', { method: 'POST', body: { question, startDate, endDate, clientId } })`.
- Response `{ answer, grounding }` renders in a single answer card **below** the input. A new question **replaces** the card.
- Answer card:
  - The `answer` text (rendered as plain text / minimal formatting).
  - A **"Show the numbers"** toggle (`UCollapsible`) that reveals the `grounding` per-channel facts as a small `UTable` (channel + spend/leads/conversions/revenue/sessions/CPL/CPA as present in the grounding payload).
- States: idle (no card), loading (spinner/skeleton in the card area, input disabled), error (`useToast` error + no card). Empty question is a no-op.
- A couple of example-question chips (e.g. "Which channel had the best cost per lead?") seed first use; clicking one fills the input. (Static strings, not from the API.)

**Out of scope:** threaded chat, persisted history, streaming responses.

---

## Feature 2 — Internal benchmarks

**Component:** `app/components/agency/AnalyticsBenchmarks.client.vue`.
**Placement:** the Insights tab body.
**Data:** `useFetch('/api/agency/analytics/internal-benchmarks', { query: { startDate, endDate, clientId? }, watch: [...] })`.

Response shape (from the endpoint): `{ window, clientCount, metrics }` where each metric carries portfolio distribution stats (quartiles / median) and — when `clientId` is supplied — that client's value and percentile rank vs the portfolio median. Metrics: GA4 engagement rate, CVR, CPL, CPA.

Two render modes, switched on whether the filter bar has a client selected:

- **Client selected → client standing:**
  - **Metric cards** (one per metric): the client's value, the portfolio median, and a percentile badge ("Top 22%", "P78"). Reuses the existing KPI-card visual pattern. Badge color is semantic and **direction-aware** — for cost metrics (CPL, CPA) lower is better, so a low percentile of cost is good; the component must encode per-metric "good direction" so badges aren't misleading.
  - **Percentile bars** below the cards (one per metric): a range bar (portfolio min→max with quartile ticks) and a marker dot for this client, for distribution context.
- **No client selected → agency leaderboard:**
  - A `UTable` ranking clients per metric (sortable columns), so the agency can spot leaders/laggards across the portfolio. Columns: client name + each metric value (+ optionally the client's percentile). Uses Nuxt UI v4 `UTable` column shape (`accessorKey`/`header`, `row.original.*`).

States: loading (skeleton), empty (no portfolio data / `clientCount` 0 → friendly empty state), error (toast). Semantic dark-mode colors throughout.

---

## Feature 3 — Presets

**Touches:** `app/components/agency/BlendedPanel.client.vue` (add a control to its header; no new component required, though a small `usePresets` composable may hold the fetch).
**Data:** `GET /api/agency/analytics/presets` → `{ presets: BlendPreset[] }`. Each preset: `{ id, label, description, metrics, dimension: 'canonical_channel', attributionModel }`.

- Add a `USelectMenu` "View" dropdown to the Blended panel header. Options = the presets plus a default **"All metrics"** entry (current behavior, sentinel id e.g. `'all'` — never an empty-string value).
- Selecting a preset **filters which metric columns are displayed** in the blended table to that preset's `metrics` (channel column always shown). "All metrics" restores the full 9-column table.
- The selected preset's `attributionModel` renders as a small **caption** under the dropdown ("Last-click attribution") — informational only.
- **v1 is pure client-side column filtering.** The blended endpoint is not re-queried and takes no attribution-model parameter; the caption documents intent without implying a live attribution recompute. (A future enhancement could push `attributionModel` to a blended/attribution query when multi-touch attribution lands.)

States: dropdown disabled while presets are loading; if the presets fetch fails, the panel silently falls back to "All metrics" (no blocking error — the blended table still works).

---

## Feature 4 — Export-token manager

**Page:** `app/pages/settings/integrations/analytics-export.vue` + a nav/menu entry in the integrations settings area.
**Rationale:** these tokens are credentials for `GET /api/export/analytics` (bearer-token pull of the canonical fact as CSV/JSON, for a warehouse or a client). That makes this a data-export integration, not an analytics insight surface — so it lives in settings, keeping the dashboard focused on analysis.

- **List:** `useFetch('/api/agency/analytics/export-tokens')` → `UTable` of tokens showing label, scope (client-scoped vs agency-wide), created date, created-by. **The token value and hash are never shown** (the list endpoint never returns them).
- **Mint:** a "Mint token" `UButton` opens a `UModal` with a `UFormField`-wrapped label `UInput` and an optional client `USelectMenu` (sentinel for "agency-wide", mapped back before the call). Submit → `$fetch('/api/agency/analytics/export-tokens', { method: 'POST', body: { label, clientId? } })`. The response returns the plaintext token **once** — display it in a copy-to-clipboard reveal with a prominent "save this now — you won't be able to see it again" warning. Closing the reveal refreshes the list.
- **Revoke:** per-row "Revoke" action → confirmation `UModal` → `$fetch('/api/agency/analytics/export-tokens/[id]', { method: 'DELETE' })` (soft-revoke) → refresh list.
- States: loading skeleton, empty state ("No export tokens yet"), success/error toasts.

---

## Cross-cutting requirements

- **Nuxt UI v4 only** — no native dialogs/inputs. `confirm()` → `UModal`; `<select>` → `USelectMenu`; etc. (per `CLAUDE.md` UI Rules).
- **Forms** — every field wrapped in `UFormField` with a `label`. Run the `frontend-design` skill before building the mint-token and any other forms (mandatory per project rules).
- **USelectMenu values** — never empty strings; use sentinels (`'all'`, agency-wide marker) and map back before API calls.
- **Dark mode** — semantic colors (`text-muted`, `bg-elevated`, `border-default`) and `dark:` variants; status/badge colors get `dark:` variants for contrast.
- **Data access** — `useFetch` for reads, `$fetch` for mutations. Reads inherit the shared filter props and `watch` them.
- **No backend / DB changes** — all four endpoints, their RBAC gates, and the export consumer already exist. This is purely additive UI.
- **RBAC** — pages/components surface only to roles already permitted by the endpoints (CLIENTS / MEDIA_BUYING permission sets); rely on the existing server gates plus standard page middleware.

## Testing

- Unit-test any pure helpers extracted (e.g. percentile/“good-direction” badge logic, preset→column mapping, agency-vs-client mode selection) with Vitest.
- Component behavior: ask-box replace-on-new-question, benchmarks mode switch (client vs no-client), preset column filtering, token mint one-time reveal + revoke. Follow existing analytics component test patterns where present; otherwise focus tests on extracted pure logic.
- Manual UAT: load `/agency/analytics`, exercise both tabs with and without a client filter; mint + revoke a token in settings.

## Front-facing page sync

Per `CLAUDE.md`, after implementation update the marketing/feature pages that enumerate analytics capabilities (e.g. `app/pages/features/*`, `MarketingNav.vue`) so these four now-visible features are reflected publicly. Tracked as a final implementation step.

## Explicitly out of scope

- Attribution-model selector UI (deferred until multi-touch backend exists).
- Threaded/streaming Ask chat, persisted question history.
- Live attribution recompute driven by presets.
- Direct push export connectors (BigQuery/Snowflake/S3) — the pull API is the surface here.
- Any new endpoint, schema, or migration.
