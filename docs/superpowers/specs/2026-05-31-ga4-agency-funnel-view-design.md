# GA4 Agency Funnel View — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design)
**Phase:** GA4-into-analytics, Phase 2, slice 1 of N

## Goal

Wire the already-built, already-tested `/api/agency/analytics/funnel` endpoint into a
staff-facing UI on the agency analytics page, as an **enterprise-grade** GA4 website
funnel view — not a bare data table. The funnel shows, per GA4 default-channel group,
the path from **ad spend → website sessions → GA4 key events → captured leads**, with
stage-to-stage conversion, period-over-period movement, and channel comparison.

This is the entry point for "GA4 into analytics + other sections" (see
`docs/superpowers/handoffs/2026-05-31-session-handoff.md`, open thread #1).

## Background / constraints

- GA4 data is **per-client**: a GA4 property maps to one `agency_clients` row; the
  funnel is channel-grain *within one property*. It cannot aggregate across clients.
- The agency analytics page (`app/pages/agency/analytics/index.vue`) filters by a
  specific client **or** "all clients" (`clientId = null`) via `useAnalytics()` +
  `AnalyticsFilterBar`.
- The funnel endpoint **requires** `clientId`, `startDate`, `endDate`. So when no
  client is selected the funnel has nothing coherent to show.
- The working **portal** twin (`PortalFunnelChart` = `app/components/portal/FunnelChart.client.vue`)
  is the proven layout to draw from, but is client-scoped and intentionally minimal.
- `buildFunnel()` (`server/utils/ga4Funnel.ts`) already returns the full per-channel
  metric set (spend, sessions, engagedSessions, keyEvents, leads, costPerSession,
  costPerKeyEvent, costPerLead, sessionToLeadRate) plus a `totals` row. Null ratios are
  `null`, never `Infinity`.

## Decisions (locked during brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| No-client state | **Prompt to pick a client** (inline empty state) | Matches the per-client reality of GA4; discoverable; no endpoint hack |
| First-pass scope | **Mirror portal + extra internal metrics** | Staff get the richer columns the endpoint already returns but the portal hides |
| Enterprise enhancements (this slice) | **Visual funnel + conversion rates**, **period-over-period deltas**, **channel bars + best/worst** | All driven by the existing data shape (deltas need a bounded prior-window calc) |
| Enterprise enhancement (deferred) | **AI insight callout (Groq)** → fast-follow | Purely additive; introduces AI latency/cost/failure-handling — keep out of v1 until data surface is proven |
| Component strategy | **New `AnalyticsFunnelChart`**, leave `PortalFunnelChart` untouched | The two diverge enough (required clientId, extra columns, empty states, prev-period) that abstraction now would be premature |

## Architecture

Two units, each independently understandable and testable:

### 1. Endpoint — `server/api/agency/analytics/funnel.get.ts` (extend)

Add a **previous equal-length period** to the response. The prior window mirrors
`overview.get.ts`: `prevEnd = startDate − 1 day`, `prevStart = prevEnd − (endDate − startDate)`.

Refactor the existing three-query block (spend / GA4 / leads → `buildFunnel`) into a
local helper so it runs for both windows without duplication:

```ts
async function funnelForWindow(clientId, startDate, endDate): Promise<{ channels, totals, hasGa4 }>
```

New response shape (additive — existing consumers unaffected since there are none yet):

```ts
{
  channels: FunnelChannelRow[],   // current window (unchanged)
  totals: FunnelChannelRow,       // current window (unchanged)
  hasGa4: boolean,                // current window (unchanged)
  previous: {                     // NEW
    totals: FunnelChannelRow      // prior-window totals only (channels not needed for deltas)
  }
}
```

- Date math is computed in JS (same approach as `overview.get.ts`), passed as ISO date
  strings to the existing queries. No new SQL shapes — just a second invocation over the
  shifted dates.
- `requireAuth(event)` stays. No role change (the page is already `role-media` gated and
  the portal twin is the public-facing one).

### 2. Component — `app/components/analytics/FunnelChart.client.vue` (new)

Auto-imports as **`AnalyticsFunnelChart`** (folder prefix). Client-only (`.client.vue`)
to match the portal twin and because it's purely presentational with browser-side fetch.

**Props:** `clientId: string | null`, `startDate: string`, `endDate: string`.

**Fetch:** `useFetch('/api/agency/analytics/funnel', { query: { clientId, startDate, endDate }, watch: [...] })`.
Guard so **no fetch fires when `clientId` is null** (use an `immediate`/`computed`-disabled
guard or early `v-if` before the child that fetches).

**Render states:**

1. `clientId == null` → card with empty state: *"Select a client to view its GA4 website funnel."* (icon `i-lucide-filter`). No fetch.
2. pending → skeletons.
3. fetched, `hasGa4 === false` → empty state: *"No GA4 property mapped for this client."* + ghost link button to `/agency/social/ga4` ("Map a property").
4. `hasGa4` → full view (below).

**Full view — three blocks:**

**(a) Visual funnel** — four stages (Ad spend → Sessions → GA4 key events → Leads) as a
proportional horizontal funnel. Each stage shows:
- its value (`fmtCurrency` for spend, `fmtCompact` otherwise),
- a ▲/▼ **delta vs previous period** (computed client-side: `(curr − prev) / prev`).
  Coloring: **Sessions / Key events / Leads** are "more is better" → up=green, down=red.
  **Ad spend** is contextual, not good/bad → render its delta in a neutral/muted tone
  (direction shown, no green/red judgement). Cost-metric inversion (lower=better) applies
  to the **table's** cost columns, not the funnel stages.
- **stage-to-stage conversion %** rendered *between* stages (sessions/… ; key events/sessions;
  leads/key events). Conversion between spend→sessions is shown as cost/session instead
  (spend isn't a count, so a % is meaningless there) — label it "cost / session".
- Bar width is proportional to the stage's share of the **first counted stage**
  (sessions), so the funnel narrows visually. Spend is shown as a cost rail, not a bar
  (different unit). Guard against divide-by-zero → 0-width / `—`.

**(b) Channel table** (`UTable`): columns
`Channel · Spend · Sessions · Engaged · Key events · Leads · Cost/session · Cost/key-event · Cost/lead · Session→lead %`.
- **Inline share bars** behind the Sessions and Leads cells (channel value ÷ totals),
  giving an at-a-glance read of channel mix.
- **Best/worst cost-per-lead highlighting**: lowest non-null cost/lead → success tint;
  highest → warning tint. Channels with null cost/lead (no spend, e.g. Organic) are
  excluded from best/worst selection.
- Null ratios render as `—` (reuse the portal's `fmtRatio` pattern).

**(c)** (no third block in v1 — AI callout deferred.)

**Header:** "Website & Funnel" with the existing info `UTooltip` ("GA4 key events are the
on-site conversion signal; Leads are captured ground truth — they won't match exactly.").

### Placement

Bottom of `app/pages/agency/analytics/index.vue`, after the Client Breakdown section:

```vue
<AnalyticsFunnelChart
  :client-id="filters.clientId"
  :start-date="filters.startDate"
  :end-date="filters.endDate"
  class="mt-6"
/>
```

`filters` already comes from `useAnalytics()` on that page.

## Data flow

```
AnalyticsFilterBar → useAnalytics().filters {clientId, startDate, endDate}
  → AnalyticsFunnelChart props
    → (clientId set) useFetch /api/agency/analytics/funnel
      → funnelForWindow(current) + funnelForWindow(previous)
        → buildFunnel() x2
      → { channels, totals, hasGa4, previous: { totals } }
    → client-side delta + conversion + best/worst computation
    → visual funnel + channel table
```

## Error handling

- Missing params → endpoint already 400s (unchanged).
- `clientId` null → component never fetches; shows pick-a-client state.
- Empty GA4 (`hasGa4 false`) → no-property state with deep link.
- Divide-by-zero in conversion %, share bars, deltas → render `—` / 0-width; never
  `NaN`/`Infinity` (mirrors `buildFunnel`'s null-ratio discipline).
- Fetch error → `useFetch` error → small inline error message in the card (don't crash
  the page).

## Testing

- **Endpoint** (`test/api/...` or extend existing util test scope): assert the response
  now includes `previous.totals`, and that the prior window is the correct shifted range
  (e.g. a 7-day current window yields a 7-day prior window ending the day before
  `startDate`). Reuse `buildFunnel` fixtures where possible.
- **Component** (`test/components/AnalyticsFunnelChart.*` with happy-dom + mocked
  `useFetch`): cover the three render states (no-client, no-GA4, populated) and the
  client-side math — delta sign/inversion, stage conversion %, best/worst cost-per-lead
  selection with a null-cost channel present.

## Out of scope (this slice)

- AI insight callout (Groq) — fast-follow.
- GA4 channel/session data into the cross-platform KPI cards / trend chart / dashboard
  widgets (handoff thread #1b/#1c) — later slices.
- Standalone website-analytics views (traffic by channel over time) — later.
- Any change to the portal funnel or `buildFunnel`.
- GA4 cron trigger (handoff thread #4 — ops task, separate).

## Reference files

```
server/api/agency/analytics/funnel.get.ts     # endpoint to extend
server/api/agency/analytics/overview.get.ts    # prior-period pattern to mirror
server/utils/ga4Funnel.ts                       # buildFunnel() — unchanged
app/components/portal/FunnelChart.client.vue    # layout to draw from (untouched)
app/pages/agency/analytics/index.vue            # placement target
app/composables/useAnalytics.ts                 # fmtCurrency/fmtCompact/fmtPercent, filters
test/utils/ga4Funnel.test.ts                    # existing buildFunnel tests
```
