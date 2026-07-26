# Phase B: Funnel & Intent Signals — Design

Date: 2026-07-26
Status: Approved, ready for implementation planning

## Context

This is Phase B of the marketing-signal data collection roadmap captured in
`docs/superpowers/handoffs/2026-07-26-persona-360-tracking-fixes-and-roadmap.md`.
Phase A (vehicle-page detection via `getVehicleContext()`, Consent Mode v2) is
shipped and verified live in production against the Persona 360 pilot client,
South Morang Motor Group (`tracking_sites.id =
'76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`, `write_key =
'xf_AGssQKpct8RI3bvtYWx5RtJl'`).

Phase B adds six funnel/intent signals as small additions to the public
tracking tag (`public/track.js`, ~1700 lines), with no new infrastructure —
everything ships in the existing tag and existing `POST /api/public/track`
ingestion pipeline.

## Goal

Give the ad-spend-efficiency work in Phase C (intent-tier scoring, exclusion
audiences, conversion-value passing) richer signal than "visited the site" or
"viewed a vehicle." Concretely: distinguish a visitor who viewed one vehicle
once from one who compared five SUVs, came back to the same listing twice,
and hovered over the "get quote" button — because those visitors deserve
different bids and different retargeting treatment.

## Non-goals

- No new backend infrastructure (queues, cron jobs, new tables). Events flow
  through the existing `crm_customer_signals` / `tracking_events` pipeline
  unchanged.
- No on-page intervention logic (chat prompts, offer banners) in this phase —
  this phase only produces the *signals* those interventions would consume
  later. Client-side, real-time-capable detection is chosen specifically so
  that later phase doesn't require redoing the detection layer, but wiring an
  actual on-page reaction is out of scope here.
- No true VIN extraction. South Morang's site (and likely most dealer sites
  on this platform) has no `Vehicle`/`Car` JSON-LD schema — only
  `AutoDealer`. All six signals use `vehicle_stock_number` (preferred) or
  `vehicle_slug` (fallback) as the identity key, both already extracted by
  the existing `getVehicleContext()` (`public/track.js:701-764`).

## Architecture

All six signals are implemented as additions to `public/track.js`, following
the file's existing conventions:

- Storage keys use the `_xf_<name>_v1` naming convention already established
  by `FIRST_TOUCH_STORAGE_KEY` / `LAST_TOUCH_STORAGE_KEY`
  (`public/track.js:488-489`).
- Storage **writes** happen unconditionally (not consent-gated) — this
  mirrors the existing first/last-touch behavior, where attribution state is
  always recorded locally and the consent decision is applied only at the
  `track()` send boundary via `isEventAllowed()` (`public/track.js:384-434`).
- Where a signal overlaps an existing generic event (dwell time ↔
  `engagement`, VDP scroll ↔ `scroll`), we enrich the existing event's
  payload rather than building a parallel detector — this follows the
  established `page_view` + `vehicle_view` dual-fire pattern
  (`public/track.js:767-789`), where a generic event is enriched with vehicle
  context and, where there's genuine additional ad-platform value, a second,
  more specific event also fires.
- New event names are added only where no existing event captures the
  signal.

## The six signals

### 1. Cross-shop / comparison-set tracking

New sessionStorage key `_xf_session_vehicles_v1`: an array of distinct
vehicle keys (`vehicle_stock_number` or `vehicle_slug`) viewed this session,
capped at 20 entries.

On every `vehicle_view` (i.e., inside `trackPageView()`,
`public/track.js:767-789`, where `vehicleCtx` is truthy):
1. Append the vehicle key to `_xf_session_vehicles_v1` if not already
   present.
2. If the distinct count just crossed one of `[2, 3, 5]` (configurable —
   see Config below), fire:
   ```js
   track('vehicle_comparison', {
     distinct_vehicles_viewed: count,
     vehicle_keys: sessionVehicles.slice(-10) // cap payload size
   })
   ```

### 2. Return-to-vehicle

New localStorage key `_xf_vehicle_visits_v1`: a map of `{ [vehicleKey]:
lastSeenTimestampMs }`, capped at 50 entries (evict oldest on overflow).

On every `vehicle_view`:
1. Look up the current vehicle key in `_xf_vehicle_visits_v1`.
2. If found, and the stored timestamp is from a different session (compare
   against the current session's start, using the existing session-cookie
   mechanism at `public/track.js:295-306`), fire:
   ```js
   track('return_to_vehicle', {
     vehicle_key: key,
     days_since_last_visit: Math.floor((now - lastSeen) / 86400000)
   })
   ```
3. Always update the map with the current timestamp (whether or not the
   event fired), so the *next* visit's gap is measured from *this* visit.

`return_to_vehicle` is already a reserved event name in `TRACK_EVENT_NAMES`
(`server/utils/tracking/track-schema.ts:32`) and in `DATALAYER_EVENTS`
(`public/track.js:56`) — no schema changes needed for this signal.

### 3. VDP dwell time

No new event name. `setupEngagementTracking()` (`public/track.js:1157+`)
already fires `engagement` events at configurable intervals
(`ENGAGEMENT_INTERVALS`, default `[30, 60, 120, 300]` seconds). Merge
`getVehicleContext()` into the engagement payload when present, the same way
`trackPageView()` already merges it into `page_view`. No changes to
`pushToDataLayer()` are needed — it already copies `vehicle_make` /
`vehicle_model` / `vehicle_name` / `vehicle_id` from `eventData` into the
pushed `user_engagement` dataLayer payload when present
(`public/track.js:253-256`).

### 4. Exit-intent detection

Desktop-only (no reliable mobile equivalent — documented limitation, not a
gap to fix here). A `mouseout` listener on `document`, firing when
`event.clientY <= 0` and the pointer's `relatedTarget` is `null` (leaving the
viewport, not just moving to a child element) — the standard exit-intent
detection pattern. Debounced to fire at most once per session (sessionStorage
flag, not the `_xf_session_vehicles_v1` map).

```js
track('exit_intent', {
  path: window.location.pathname,
  is_vehicle_page: !!vehicleCtx,
  vehicle_key: vehicleCtx ? (vehicleCtx.vehicle_stock_number || vehicleCtx.vehicle_slug) : null
})
```

New event name — needs adding to `TRACK_EVENT_NAMES`, `isEventAllowed`, and
`DATALAYER_EVENTS`.

### 5. Wishlist / save tracking

Click-delegation heuristic, structurally identical to the existing CTA-click
keyword detector in `pushToDataLayer()` (`public/track.js:216-244`), using
the existing `CTA_CLICK_SELECTORS` list at `public/track.js:71` as the model
for a new `WISHLIST_SELECTORS` list: a
`WISHLIST_SELECTORS` list (`[data-wishlist]`, `.wishlist`, `.favourite`,
`.save-vehicle`) checked first, falling back to `aria-label` keyword matching
(`/wishlist|favou?rite|save/i`) against the clicked element and its
ancestors (walk up to 5 parents, matching the existing `phone_click`
delegation pattern at `public/track.js:1565-1578`).

Fires the **already-reserved** `add_to_wishlist` event
(`TRACK_EVENT_NAMES`, `isEventAllowed`'s `marketingEvents` bucket) with
vehicle context merged in. No schema changes needed.

### 6. CTA/price visibility

`IntersectionObserver` (threshold `0.5`) over elements matching the existing
`CTA_CLICK_SELECTORS` (`public/track.js:65`) plus a price-selector heuristic
(`[data-price]`, `.price`, `.vehicle-price`). Fires once per observed element
per page load when it crosses 50% visible:

```js
track('cta_visible', {
  selector: matchedSelector,
  text: (el.textContent || '').substring(0, 100)
})
```

New event name — needs adding to `TRACK_EVENT_NAMES`, `isEventAllowed`, and
`DATALAYER_EVENTS`.

## Server-side changes

`server/utils/tracking/track-schema.ts`:
- Add `vehicle_comparison`, `exit_intent`, `cta_visible` to
  `TRACK_EVENT_NAMES` (line 19-33, enum declared line 35). This also fixes a
  pre-existing latent gap: `vehicle_comparison` is already referenced in
  `track.js`'s `isEventAllowed()` analytics-consent list but was never added
  to this server-side allowlist, so it would 422 today if anything fired it.

`public/track.js`:
- `isEventAllowed()` (line 384-434): add `vehicle_comparison`, `exit_intent`,
  `cta_visible` to the `analyticsEvents` list (same consent tier as
  `vehicle_view`/`search` — these are behavioral-analytics signals, not
  marketing-consent-gated like `add_to_wishlist`).
- `DATALAYER_EVENTS` (line 41-59): add mappings for `vehicle_comparison`,
  `exit_intent`, `cta_visible` (dataLayer event names: `vehicle_comparison`,
  `exit_intent`, `cta_visible` — no existing GTM convention to match, so
  using the internal name directly).

No changes to `TrackEventSchema`'s `event_data` field — it's already
`z.record(z.string(), z.unknown())` (freeform), so new payload fields on any
event (existing or new) require no schema change.

## Rollout & configuration

- New `data-funnel-signals="false"` opt-out attribute on the script tag,
  independent of the existing `data-behavioral="false"` flag
  (`public/track.js:1620-1628`). Wired into `init()` the same way: `if
  (config.funnelSignals !== false) { setupCrossShopTracking();
  setupReturnToVehicleTracking(); setupExitIntentDetection();
  setupWishlistTracking(); setupCtaVisibilityTracking(); }` (VDP dwell needs
  no separate setup call — it's inline in the existing
  `setupEngagementTracking()`).
- Ships live for all sites using the tag the moment `track.js` redeploys,
  same as Phase A. No per-site gating needed: every detector no-ops
  gracefully when `getVehicleContext()` returns null (non-automotive pages)
  or when the relevant DOM elements aren't present.
- Thresholds configurable via the existing `init({ constants: {...} })`
  override pattern (`public/track.js:1490-1503`): `comparisonThresholds`
  (default `[2, 3, 5]`), `returnToVehicleMinDays` (default `0` — fire on any
  cross-session return), `ctaVisibilityThreshold` (default `0.5`).

## Testing & verification

- Unit tests added to `test/public/track-tag.test.ts` for each new detector,
  jsdom-based, matching the existing style used for scroll/engagement
  threshold tests in that file.
- Post-deploy verification: query `tracking_events` for South Morang
  (`site_id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`) for the six event
  names (`vehicle_comparison`, `return_to_vehicle`, `engagement` with vehicle
  fields present, `exit_intent`, `add_to_wishlist`, `cta_visible`) appearing
  on real traffic post-deploy — the same verification approach used for
  Phase A's `vehicle_view` rollout this session.

## Open items deferred to Phase C or later

- No intent-tier scoring consumes these signals yet (that's Phase C item
  #7 — depends on this phase shipping first).
- No on-page real-time intervention (chat prompt on return-to-vehicle, offer
  banner on exit-intent) — signals only, per Non-goals above.
- Wishlist/CTA-visibility selector heuristics are best-effort and may need
  per-site tuning once live on dealer sites beyond South Morang (no dealer
  CMS convention exists to detect these reliably across all sites).
